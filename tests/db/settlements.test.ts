/**
 * Cierre de cuentas (migracion 0080, D-241, BR-Z01..BR-Z18).
 *
 * TODO OCURRE EN UNA ORGANIZACION PROPIA. La suite crea vendedores con acuerdos
 * distintos, equipos, rifas configurables con premios, entregas y cierres; en
 * «Rifas Demo» le cambiaria el estado a las demas suites (la trampa de I-035).
 *
 * Las ESCRITURAS DE NEGOCIO van por las RPC y las sesiones reales: el Dueño y el
 * Administrador de la organizacion, cada vendedor para vender, cobrar y
 * confirmar, y cada vendedor a cargo para su equipo. La base se prepara con
 * PostgreSQL directo, y los PREMIOS GANADOS tambien: se escriben la fotografia
 * del sorteo y su enlace al premio igual que los deja el motor (D-208), porque
 * el motor solo premia sorteos futuros y el pago de un premio exige un sorteo
 * ya jugado.
 *
 * Las cifras que se esperan estan escritas A MANO, con la aritmetica a la
 * vista. Ninguna sale de la misma funcion que se prueba.
 */
import { randomUUID } from 'node:crypto'

import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SETTLEMENT_FUNCTION_CHECKS } from '../../scripts/settlement-function-grants'

import {
  DB_URL,
  loadSeedContext,
  SEED_PASSWORD,
  signInAs,
  USERS,
  voidPaymentAs,
  type Client,
} from './helpers'

let db: PgClient
let ctx: Awaited<ReturnType<typeof loadSeedContext>>

const STAMP = Date.now().toString(36)
const PRECIO = 120_000
const PREFIJO_SORTEO = `CIE-${STAMP}`

let org: string
let org2: string
let dueno: Client
let admin: Client
let hoy: string
/** Rifa de la tabla de casos y de las pruebas sueltas. */
let RP: string
/** Rifa del ejemplo completo del Figma. */
let RF: string

type Premio = { prizeId: string; versionId: string }
const premios = new Map<string, Premio>()

const personas = new Map<string, { id: string; email: string }>()
const sesiones = new Map<string, Client>()
const clientes = new Map<string, string>()
const contador = new Map<string, number>()
let secuencia = 0

// -----------------------------------------------------------------------------
// Preparacion
// -----------------------------------------------------------------------------

const id = (clave: string) => personas.get(clave)!.id

/** Cuenta de Auth idempotente: la bitacora las conserva como actores (BR-D02). */
async function persona(clave: string, nombre: string) {
  const email = `cierre-${clave}@pruebas.test`.toLowerCase()
  const { data: existente } = await ctx.svc
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  let perfil = existente?.id ?? null
  if (perfil === null) {
    const { data, error } = await ctx.svc.auth.admin.createUser({
      email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: nombre, phone: '3001234567' },
    })
    if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`)
    perfil = data.user.id
  }
  await ctx.svc.auth.admin.updateUserById(perfil, { password: SEED_PASSWORD })
  await db.query(
    `update profiles set full_name = $2, activated_at = coalesce(activated_at, now()) where id = $1`,
    [perfil, nombre],
  )
  personas.set(clave, { id: perfil, email })
  return perfil
}

async function sesion(clave: string): Promise<Client> {
  const ya = sesiones.get(clave)
  if (ya) return ya
  const nueva = await signInAs(personas.get(clave)!.email)
  sesiones.set(clave, nueva)
  return nueva
}

async function cliente(sellerId: string, orgId = org) {
  const { rows } = await db.query(
    `insert into clients (organization_id, seller_id, name, phone)
     values ($1, $2, $3, '3009990000') returning id`,
    [orgId, sellerId, `Cliente de ${sellerId.slice(0, 4)}`],
  )
  clientes.set(sellerId, rows[0].id)
}

/** Alta del personal, por la RPC de la aplicacion (BR-G30). */
async function altaDirecta(
  clave: string,
  nombre: string,
  acuerdo: { mode: 'fixed_per_ticket' | 'tiered'; fixed?: number },
) {
  const perfil = await persona(clave, nombre)
  const { error } = await dueno.rpc('staff_create_seller_membership', {
    p_organization_id: org,
    p_profile_id: perfil,
    p_mode: acuerdo.mode,
    p_fixed_amount: acuerdo.fixed,
  })
  if (error) throw new Error(`Alta de ${nombre}: ${error.message}`)
  await cliente(perfil)
  return perfil
}

/** Alta de un integrante por SU vendedor a cargo, como en «Mi equipo» (BR-E04). */
async function altaIntegrante(
  clave: string,
  nombre: string,
  padre: string,
  modelo: { model: 'fixed_per_ticket' | 'tiered'; amount?: number },
) {
  const perfil = await persona(clave, nombre)
  const { error } = await (await sesion(padre)).from('memberships').insert({
    organization_id: org,
    profile_id: perfil,
    role: 'seller',
    parent_seller_id: id(padre),
    commission_model: modelo.model,
    fixed_commission_amount: modelo.amount ?? null,
  })
  if (error) throw new Error(`Alta de ${nombre}: ${error.message}`)
  await cliente(perfil)
  return perfil
}

/** Una rifa configurable en borrador. Sus premios juegan en 2087: aqui se enlazan a mano. */
async function nuevaRifa(nombre: string, orgId = org) {
  const { rows: duenoFila } = await db.query(
    `select profile_id from memberships where organization_id = $1 and role = 'owner'`,
    [orgId],
  )
  const { rows } = await db.query(
    `insert into raffles (organization_id, name, ticket_price, status, start_date, end_date,
                          created_by, prize_mode)
     values ($1, $2, $3, 'draft', '2026-01-01', '2087-12-31', $4, 'configurable') returning id`,
    [orgId, `${nombre} ${STAMP}`, PRECIO, duenoFila[0].profile_id],
  )
  return rows[0].id as string
}

async function premio(
  raffleId: string,
  clave: string,
  titulo: string,
  recompensa: {
    modo?: 'fixed' | 'winner_choice'
    opciones: Array<{ description: string | null; amount: number | null }>
  },
  mes: string,
) {
  const { data, error } = await dueno.rpc('create_raffle_prize', {
    p_raffle_id: raffleId,
    p_title: titulo,
    p_category: 'daily',
    p_reward_mode: recompensa.modo ?? 'fixed',
    p_reward_options: recompensa.opciones,
    p_number_field: 'daily_number',
    p_digits: 'four',
    p_rules: [
      {
        start_date: `2087-${mes}-03`,
        end_date: `2087-${mes}-28`,
        weekdays: [1, 2, 3, 4, 5],
        lottery_mode: 'corresponding',
        lottery_code: null,
      },
    ],
  })
  if (error) throw new Error(`No se pudo crear «${titulo}»: ${error.message}`)
  const fila = (data as unknown as Array<{ prize_id: string; version_id: string }>)[0]!
  premios.set(clave, { prizeId: fila.prize_id, versionId: fila.version_id })
}

async function activar(raffleId: string) {
  await db.query(`update raffles set status = 'active' where id = $1`, [raffleId])
}

async function boletas(raffleId: string, sellerId: string, n: number): Promise<string[]> {
  const inicio = contador.get(raffleId) ?? 0
  contador.set(raffleId, inicio + n)
  const { rows } = await db.query(
    `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number,
                          weekly_number, inventory_status)
     select m.organization_id, $1, $2, $2, lpad((($3::int + g) % 10000)::text, 4, '0'),
            lpad((($3::int + g) / 10000 + 1)::text, 4, '0'), 'available'
     from generate_series(1, $4::int) g
     cross join (select organization_id from raffles where id = $1) m
     returning id`,
    [raffleId, sellerId, inicio, n],
  )
  return rows.map((r) => r.id as string)
}

/** Crea `n` boletas del vendedor y vende las `vendidas` primeras. */
async function vender(
  clave: string,
  raffleId: string,
  vendidas: number,
  opciones: { total?: number; precio?: number } = {},
) {
  const ids = await boletas(raffleId, id(clave), opciones.total ?? vendidas)
  const venta = ids.slice(0, vendidas)
  if (venta.length > 0) {
    const { error } = await (
      await sesion(clave)
    ).rpc('bulk_assign_tickets', {
      p_ticket_ids: venta,
      p_client_id: clientes.get(id(clave))!,
      p_sale_price: opciones.precio,
    })
    if (error) throw new Error(`No se pudo vender: ${error.message}`)
  }
  return venta
}

async function cobrar(clave: string, ids: string[], monto?: number) {
  const { rows } = await db.query(`select id, sale_price from tickets where id = any($1)`, [ids])
  const asignaciones = rows.map((r) => ({
    ticket_id: r.id as string,
    amount: monto ?? Number(r.sale_price),
  }))
  const { data, error } = await (
    await sesion(clave)
  ).rpc('create_payment', {
    p_client_id: clientes.get(id(clave))!,
    p_total_amount: asignaciones.reduce((s, a) => s + a.amount, 0),
    p_allocations: asignaciones,
  })
  if (error) throw new Error(`No se pudo cobrar: ${error.message}`)
  return data as unknown as string
}

/**
 * Un premio ganado sobre la boleta, como lo deja el motor (D-208): un sorteo ya
 * jugado con su resultado, la fotografia de la boleta y el enlace al premio.
 * Busca un par lotería–fecha libre entre el inicio del historial y ayer, o en
 * la fecha pedida (`fecha`), que puede ser ANTERIOR al historial (I-194).
 */
async function premiar(
  ticketId: string,
  clavePremio: string,
  opciones: { conflicto?: boolean; fecha?: string } = {},
) {
  const premioFila = premios.get(clavePremio)!
  secuencia += 1
  await db.query('begin')
  try {
    await db.query('set local session_replication_role = replica')
    const { rows: libre } = await db.query(
      `with c as (
         select l.code as code, d::date as fecha
         from unnest(enum_range(null::lottery_code)) as l(code)
         cross join generate_series(coalesce($1::date, date '2026-08-10'),
                                    coalesce($1::date, today_bogota() - 1), interval '1 day') as d
       )
       select c.code::text as code, c.fecha::text as fecha from c
        where not exists (select 1 from lottery_draw_schedules s
                           where s.lottery_code = c.code and s.reference_date = c.fecha)
        order by c.fecha, c.code limit 1`,
      [opciones.fecha ?? null],
    )
    const { code, fecha } = libre[0] as { code: string; fecha: string }
    const { rows: prog } = await db.query(
      `insert into lottery_draw_schedules (lottery_code, draw_number, reference_date,
                                           original_scheduled_at, official_scheduled_at, schedule_status)
       values ($1, $2, $3, ($3::date + time '22:30') at time zone 'America/Bogota',
               ($3::date + time '22:30') at time zone 'America/Bogota', 'scheduled')
       returning id`,
      [code, `${PREFIJO_SORTEO}-${secuencia}`, fecha],
    )
    const { rows: numero } = await db.query(`select daily_number from tickets where id = $1`, [
      ticketId,
    ])
    const { rows: res } = await db.query(
      `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind,
                                    confirmed_at, conflicting_winning_number)
       values ($1, $2, $3, 'official_page', now(), $4) returning id`,
      [
        prog[0].id,
        numero[0].daily_number,
        opciones.conflicto ? 'conflict' : 'confirmed',
        opciones.conflicto ? '0000' : null,
      ],
    )
    const { rows: foto } = await db.query(
      `insert into lottery_ticket_matches
         (result_id, ticket_id, organization_id, raffle_id, seller_id, client_id, match_field,
          matched_number, assignment_status, inventory_status_at_draw, assigned_at, ticket_created_at)
       select $1, t.id, t.organization_id, t.raffle_id, t.seller_id, t.client_id, 'daily_number',
              t.daily_number, 'sold', 'assigned', t.assigned_at, t.created_at
         from tickets t where t.id = $2
       returning id, organization_id, raffle_id`,
      [res[0].id, ticketId],
    )
    await db.query(
      `insert into lottery_ticket_match_prizes (organization_id, raffle_id, result_id, match_id,
                                                match_field, prize_id, prize_version_id)
       values ($1, $2, $3, $4, 'daily_number', $5, $6)`,
      [
        foto[0].organization_id,
        foto[0].raffle_id,
        res[0].id,
        foto[0].id,
        premioFila.prizeId,
        premioFila.versionId,
      ],
    )
    await db.query('commit')
    return { matchId: foto[0].id as string, prizeId: premioFila.prizeId, fecha }
  } catch (error) {
    await db.query('rollback')
    throw error
  }
}

type Cuenta = {
  holder_id: string
  counterpart_id: string | null
  members: number
  tickets_active: number
  tickets_sold: number
  tickets_paid: number
  own_tickets_paid: number
  team_tickets_paid: number
  collected: number
  holder_earned: number
  holder_team_earned: number
  members_earned: number
  owner_share: number
  prizes_paid: number
  other_movements: number
  total_due: number
  delivered: number
  refunded: number
  balance: number
  awards: number
  awards_unpaid: number
  prize_cost: number
  prize_cost_org: number
  owner_gain: number | null
  status: string
  fingerprint: string
  figures: Record<string, number>
  closing_version: number | null
  changed_after_close: boolean
}

const NUMERICAS = [
  'collected',
  'holder_earned',
  'holder_team_earned',
  'members_earned',
  'owner_share',
  'prizes_paid',
  'other_movements',
  'total_due',
  'delivered',
  'refunded',
  'balance',
  'prize_cost',
  'prize_cost_org',
  'owner_gain',
] as const

/** Una cuenta, leida directamente de la definicion interna. `null` = con el dueño. */
async function cuenta(
  raffleId: string,
  titular: string,
  contraparte: string | null,
): Promise<Cuenta> {
  const { rows } = await db.query(
    `select * from settlement_account_rows($1, $2)
      where holder_id = $3 and counterpart_id is not distinct from $4`,
    [org, raffleId, id(titular), contraparte === null ? null : id(contraparte)],
  )
  const fila = rows[0]
  if (!fila) throw new Error(`No hay cuenta de ${titular} con ${contraparte ?? 'el dueño'}`)
  for (const campo of NUMERICAS) {
    if (fila[campo] !== null) fila[campo] = Number(fila[campo])
  }
  return fila as Cuenta
}

/** Confirma una entrega (o devolucion) con el saldo que la cuenta tiene ahora. */
async function entregar(
  actor: Client,
  raffleId: string,
  titular: string,
  monto: number,
  opciones: {
    kind?: 'delivery' | 'refund'
    esperado?: number
    fecha?: string
    request?: string
    contraparte?: string | null
  } = {},
) {
  const esperado =
    opciones.esperado ??
    (
      await cuenta(
        raffleId,
        titular,
        opciones.contraparte === undefined ? await padreDe(titular) : opciones.contraparte,
      )
    ).balance
  return actor.rpc('settlement_record_transfer', {
    p_raffle_id: raffleId,
    p_seller_id: id(titular),
    p_kind: opciones.kind ?? 'delivery',
    p_amount: monto,
    p_received_on: opciones.fecha ?? hoy,
    p_expected_balance: esperado,
    p_request_id: opciones.request ?? randomUUID(),
  })
}

async function padreDe(clave: string): Promise<string | null> {
  const { rows } = await db.query(
    `select parent_seller_id from memberships where organization_id = $1 and profile_id = $2`,
    [org, id(clave)],
  )
  const padre = rows[0]?.parent_seller_id as string | null
  if (!padre) return null
  for (const [k, v] of personas) if (v.id === padre) return k
  throw new Error('padre desconocido')
}

/** Registra quien pago un premio. `pagador` null = el dueño. */
async function pagarPremio(
  actor: Client,
  raffleId: string,
  premio: { matchId: string; prizeId: string },
  pagador: string | null,
  opciones: { monto?: number; fecha?: string; request?: string } = {},
) {
  return actor.rpc('settlement_record_prize_payment', {
    p_raffle_id: raffleId,
    p_match_id: premio.matchId,
    p_prize_id: premio.prizeId,
    p_payer: pagador === null ? 'organization' : 'seller',
    p_payer_id: pagador === null ? undefined : id(pagador),
    p_amount: opciones.monto,
    p_paid_on: opciones.fecha ?? hoy,
    p_request_id: opciones.request ?? randomUUID(),
  })
}

function exito<T>(respuesta: { data: T | null; error: { message: string } | null }): T {
  if (respuesta.error) throw new Error(respuesta.error.message)
  return respuesta.data as T
}

async function resumen(raffleId: string, actor: Client = dueno) {
  const filas = exito(await actor.rpc('staff_settlement_overview', { p_raffle_id: raffleId }))
  const f = filas[0]!
  return {
    accounts: f.accounts,
    closed: f.closed_accounts,
    pendingAccounts: f.pending_accounts,
    pending: Number(f.pending_total),
    inFavor: Number(f.in_favor_total),
    received: Number(f.received_total),
    refunded: Number(f.refunded_total),
  }
}

async function comision(clave: string, raffleId: string) {
  const { rows } = await db.query(
    `select tickets_paid, rate, earned, team_earned, tier_tickets_paid
       from seller_commissions where raffle_id = $1 and seller_id = $2`,
    [raffleId, id(clave)],
  )
  const f = rows[0]
  return {
    n: f.tickets_paid as number,
    rate: Number(f.rate),
    earned: Number(f.earned),
    teamEarned: Number(f.team_earned),
    tierN: f.tier_tickets_paid as number,
  }
}

// -----------------------------------------------------------------------------

beforeAll(async () => {
  ctx = await loadSeedContext()
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  const { rows: dia } = await db.query(`select today_bogota()::text as d`)
  hoy = dia[0].d

  const { rows } = await db.query(`insert into organizations (name) values ($1) returning id`, [
    `Cierre pruebas ${STAMP}`,
  ])
  org = rows[0].id
  const duenoId = await persona('dueno', 'Dueña Cierre')
  await db.query(
    `insert into memberships (organization_id, profile_id, role) values ($1, $2, 'owner')`,
    [org, duenoId],
  )
  dueno = await sesion('dueno')
  const adminId = await persona('admin', 'Administrador Cierre')
  await db.query(
    `insert into memberships (organization_id, profile_id, role) values ($1, $2, 'admin')`,
    [org, adminId],
  )
  admin = await sesion('admin')

  // Otra organizacion, para el aislamiento.
  const { rows: otra } = await db.query(
    `insert into organizations (name) values ($1) returning id`,
    [`Cierre ajena ${STAMP}`],
  )
  org2 = otra[0].id
  const dueno2 = await persona('dueno2', 'Dueño Ajeno')
  await db.query(
    `insert into memberships (organization_id, profile_id, role) values ($1, $2, 'owner')`,
    [org2, dueno2],
  )
  const vendedor2 = await persona('ajeno', 'Vendedor Ajeno')
  await db.query(
    `insert into memberships (organization_id, profile_id, role) values ($1, $2, 'seller')`,
    [org2, vendedor2],
  )

  // La rifa de los casos: un premio de $15.000, uno en especie y uno con alternativas.
  RP = await nuevaRifa('Rifa casos')
  // Cada premio juega en otro mes de 2087: dos premios no pueden jugar el mismo
  // dia con el mismo numero, las mismas cifras y la misma loteria (BR-J08).
  await premio(
    RP,
    'quince',
    'Premio quince',
    { opciones: [{ description: null, amount: 15_000 }] },
    '03',
  )
  await premio(
    RP,
    'especie',
    'Premio televisor',
    { opciones: [{ description: 'Televisor', amount: null }] },
    '04',
  )
  await premio(
    RP,
    'grande',
    'Premio grande',
    { opciones: [{ description: null, amount: 200_000 }] },
    '05',
  )
  await activar(RP)

  // La rifa del Figma: tres premios de $150.000, $100.000 y $200.000.
  RF = await nuevaRifa('Rifa de septiembre')
  await premio(
    RF,
    'diario150',
    'Premio diario',
    { opciones: [{ description: null, amount: 150_000 }] },
    '03',
  )
  await premio(
    RF,
    'semanal100',
    'Premio semanal',
    { opciones: [{ description: null, amount: 100_000 }] },
    '04',
  )
  await premio(
    RF,
    'diario200',
    'Premio diario mayor',
    { opciones: [{ description: null, amount: 200_000 }] },
    '05',
  )
  await activar(RF)
}, 180_000)

afterAll(async () => {
  // Todo lo de las dos organizaciones en UNA transaccion, con los disparadores
  // apagados: las entregas, los cierres, las fotografias y la bitacora son
  // inmutables. Las cuentas de Auth se quedan (la siguiente pasada las reutiliza).
  await db.query('begin')
  try {
    await db.query('set local session_replication_role = replica')
    for (const tabla of [
      'settlement_closings',
      'settlement_prize_payments',
      'settlement_transfers',
      'lottery_ticket_match_prizes',
      'lottery_ticket_matches',
      'payment_allocations',
      'payments',
      'notifications',
      'commission_ledger',
      'seller_commissions',
      'tickets',
      'clients',
      'audit_logs',
      'raffle_prize_schedule_rules',
      'raffle_prize_reward_options',
      'raffle_prizes',
      'raffle_prize_versions',
      'raffle_prize_transitions',
      'memberships',
    ]) {
      await db.query(`delete from ${tabla} where organization_id = any($1)`, [[org, org2]])
    }
    await db.query(
      `delete from commission_tier_list_items where list_id in
         (select id from commission_tier_lists where organization_id = any($1))`,
      [[org, org2]],
    )
    await db.query(`delete from commission_tier_lists where organization_id = any($1)`, [
      [org, org2],
    ])
    await db.query(
      `delete from lottery_results where schedule_id in
         (select id from lottery_draw_schedules where draw_number like $1)`,
      [`${PREFIJO_SORTEO}-%`],
    )
    await db.query(`delete from lottery_draw_schedules where draw_number like $1`, [
      `${PREFIJO_SORTEO}-%`,
    ])
    await db.query(`delete from raffles where organization_id = any($1)`, [[org, org2]])
    await db.query(`delete from organizations where id = any($1)`, [[org, org2]])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  }
  await db.end()
}, 120_000)

// =============================================================================
describe('Z1 — la migracion: acceso, inmutabilidad y capacidad', () => {
  it('Z1-01: cada comprobacion de verify:remote da cero diferencias en local', async () => {
    for (const check of SETTLEMENT_FUNCTION_CHECKS) {
      const { rows } = await db.query(check.sql)
      expect(rows, check.nombre).toHaveLength(check.esperado)
    }
  })

  it('Z1-02: ninguna sesion lee ni escribe las tablas directamente', async () => {
    const vendedor = await sesion('dueno')
    for (const tabla of [
      'settlement_transfers',
      'settlement_prize_payments',
      'settlement_closings',
    ] as const) {
      const lectura = await vendedor.from(tabla).select('id').limit(1)
      expect(lectura.error, tabla).not.toBeNull()
    }
    const escritura = await dueno.from('settlement_transfers').insert({
      organization_id: org,
      raffle_id: RP,
      kind: 'delivery',
      seller_id: id('dueno'),
      amount: 1,
      received_on: hoy,
      confirmed_by: id('dueno'),
      request_id: randomUUID(),
      balance_before: 1,
      balance_after: 0,
    })
    expect(escritura.error).not.toBeNull()
  })

  it('Z1-03: el Dueño y el Administrador tienen settlements.manage; el vendedor no', async () => {
    const { rows } = await db.query(
      `select r.role::text as role, 'settlements.manage' = any (app_role_default_capabilities(r.role)) as tiene
         from unnest(enum_range(null::app_role)) as r(role) order by 1`,
    )
    expect(Object.fromEntries(rows.map((r) => [r.role, r.tiene]))).toEqual({
      admin: true,
      owner: true,
      seller: false,
    })
  })
})

// =============================================================================
describe('Z2 — la tabla de casos: boleta de $120.000, jefe $30.000, integrante $20.000', () => {
  // Cuatro equipos iguales, uno por caso, para que ninguno toque las cifras de otro.
  const equipos = [1, 2, 3, 4] as const
  const premiosCaso = new Map<number, { matchId: string; prizeId: string }>()

  beforeAll(async () => {
    for (const n of equipos) {
      await altaDirecta(`h${n}`, `Jefe caso ${n}`, { mode: 'fixed_per_ticket', fixed: 30_000 })
      await altaIntegrante(`m${n}`, `Integrante caso ${n}`, `h${n}`, {
        model: 'fixed_per_ticket',
        amount: 20_000,
      })
      const [boleta] = await vender(`m${n}`, RP, 1)
      await cobrar(`m${n}`, [boleta!])
      if (n > 1) premiosCaso.set(n, await premiar(boleta!, 'quince'))
    }
  }, 120_000)

  it('Z2-01: sin premio — el integrante entrega $100.000 y el jefe $90.000', async () => {
    // Integrante: 120.000 − 20.000 = 100.000. Jefe: 100.000 − (30.000 − 20.000) = 90.000.
    expect((await cuenta(RP, 'm1', 'h1')).balance).toBe(100_000)
    const jefe = await cuenta(RP, 'h1', null)
    expect(jefe).toMatchObject({
      collected: 120_000,
      members_earned: 20_000,
      holder_team_earned: 10_000,
    })
    expect(jefe.balance).toBe(90_000)
    expect(jefe.owner_gain).toBe(90_000)
    expect(await comision('m1', RP)).toMatchObject({ earned: 20_000 })
    expect(await comision('h1', RP)).toMatchObject({ earned: 0, teamEarned: 10_000 })
  })

  it('Z2-02: premio de $15.000 pagado por el integrante — $85.000 y $75.000', async () => {
    // Antes de registrarlo, falta informacion en las dos cuentas: ganado no es pagado.
    expect((await cuenta(RP, 'm2', 'h2')).status).toBe('missing_info')
    expect((await cuenta(RP, 'h2', null)).status).toBe('missing_info')

    // Lo registra su vendedor a cargo, que es quien recibe sus entregas.
    const r = exito(await pagarPremio(await sesion('h2'), RP, premiosCaso.get(2)!, 'm2'))
    expect(r[0]!.outcome).toBe('recorded')

    expect((await cuenta(RP, 'm2', 'h2')).balance).toBe(85_000) // 100.000 − 15.000
    const jefe = await cuenta(RP, 'h2', null)
    expect(jefe.balance).toBe(75_000) // 90.000 − 15.000
    expect(jefe.owner_gain).toBe(75_000)
    // El premio no toca ninguna ganancia (BR-Z09).
    expect(await comision('m2', RP)).toMatchObject({ earned: 20_000 })
    expect(await comision('h2', RP)).toMatchObject({ teamEarned: 10_000 })
  })

  it('Z2-03: pagado por el jefe — el integrante sigue en $100.000 y el jefe baja a $75.000', async () => {
    const r = exito(await pagarPremio(dueno, RP, premiosCaso.get(3)!, 'h3'))
    expect(r[0]!.outcome).toBe('recorded')
    expect((await cuenta(RP, 'm3', 'h3')).balance).toBe(100_000)
    const jefe = await cuenta(RP, 'h3', null)
    expect(jefe.balance).toBe(75_000)
    expect(jefe.owner_gain).toBe(75_000)
  })

  it('Z2-04: pagado por el dueño — $100.000 y $90.000, y la ganancia del dueño baja a $75.000', async () => {
    const r = exito(await pagarPremio(dueno, RP, premiosCaso.get(4)!, null))
    expect(r[0]!.outcome).toBe('recorded')
    expect((await cuenta(RP, 'm4', 'h4')).balance).toBe(100_000)
    const jefe = await cuenta(RP, 'h4', null)
    expect(jefe.balance).toBe(90_000)
    expect(jefe.prize_cost_org).toBe(15_000)
    expect(jefe.owner_gain).toBe(75_000) // 90.000 − 15.000
    // El integrante gana $20.000 y el jefe $10.000 en los cuatro casos.
    expect(await comision('m4', RP)).toMatchObject({ earned: 20_000 })
    expect(await comision('h4', RP)).toMatchObject({ teamEarned: 10_000 })
  })
})

// =============================================================================
describe('Z3 — el ejemplo completo del Figma', () => {
  let premioAna: { matchId: string; prizeId: string }
  let premioCarlos: { matchId: string; prizeId: string }
  let premioLuis: { matchId: string; prizeId: string }

  beforeAll(async () => {
    // Carlos cobra por tramos con la lista general (v1: 20.000 / 25.000 desde 21 /
    // 30.000 desde 31); su tramo cuenta lo suyo y lo de su equipo (BR-G27).
    await altaDirecta('carlos', 'Carlos Ruiz', { mode: 'tiered' })
    await altaIntegrante('ana', 'Ana Gómez', 'carlos', { model: 'tiered' })
    await altaIntegrante('luis', 'Luis Pérez', 'carlos', {
      model: 'fixed_per_ticket',
      amount: 15_000,
    })
    for (const clave of ['marta', 'jorge', 'diana']) {
      await altaDirecta(clave, clave[0]!.toUpperCase() + clave.slice(1) + ' Cierre', {
        mode: 'fixed_per_ticket',
        fixed: 30_000,
      })
    }

    // 60 activas, 48 vendidas y 45 pagadas en la cuenta de Carlos.
    const carlos = await vender('carlos', RF, 22, { total: 25 })
    await cobrar('carlos', carlos.slice(0, 20))
    const ana = await vender('ana', RF, 16, { total: 25 })
    await cobrar('ana', ana.slice(0, 15))
    const luis = await vender('luis', RF, 10)
    await cobrar('luis', luis)
    await cobrar('marta', await vender('marta', RF, 8))
    await cobrar('jorge', await vender('jorge', RF, 12))
    await cobrar('diana', await vender('diana', RF, 10))

    premioAna = await premiar(ana[0]!, 'diario150')
    premioCarlos = await premiar(carlos[0]!, 'semanal100')
    premioLuis = await premiar(luis[0]!, 'diario200')

    // Ana adelantó $150.000 (lo registra Carlos), Carlos $100.000 y el dueño pagó
    // $200.000 (los registra el personal).
    exito(await pagarPremio(await sesion('carlos'), RF, premioAna, 'ana'))
    exito(await pagarPremio(dueno, RF, premioCarlos, 'carlos'))
    exito(await pagarPremio(admin, RF, premioLuis, null))

    // Lo que ya se entrego antes de hoy.
    exito(await entregar(dueno, RF, 'jorge', 1_080_000))
    exito(await entregar(admin, RF, 'diana', 900_000))
    exito(await entregar(dueno, RF, 'carlos', 1_500_000))
    exito(await entregar(await sesion('carlos'), RF, 'ana', 850_000))
    exito(await entregar(await sesion('carlos'), RF, 'luis', 1_050_000))
  }, 180_000)

  it('Z3-01: el motor puso a Carlos en $30.000 con 45 boletas y a Ana en $20.000 con 15', async () => {
    expect(await comision('carlos', RF)).toMatchObject({
      n: 20,
      tierN: 45,
      rate: 30_000,
      earned: 600_000,
    })
    // 15 × (30.000 − 20.000) + 10 × (30.000 − 15.000) = 150.000 + 150.000
    expect((await comision('carlos', RF)).teamEarned).toBe(300_000)
    expect(await comision('ana', RF)).toMatchObject({ rate: 20_000, earned: 300_000 })
    expect(await comision('luis', RF)).toMatchObject({ rate: 15_000, earned: 150_000 })
  })

  it('Z3-02: la cuenta de Carlos — entrega $3.800.000, recibido $1.500.000, falta $2.300.000', async () => {
    const c = await cuenta(RF, 'carlos', null)
    expect(c).toMatchObject({
      members: 2,
      tickets_active: 60,
      tickets_sold: 48,
      tickets_paid: 45,
      own_tickets_paid: 20,
      team_tickets_paid: 25,
      collected: 5_400_000, // 45 × 120.000
      holder_earned: 600_000,
      holder_team_earned: 300_000,
      members_earned: 450_000, // 300.000 + 150.000
      owner_share: 4_050_000, // 5.400.000 − 1.350.000
      prizes_paid: 250_000, // Ana 150.000 + Carlos 100.000
      other_movements: 0,
      total_due: 3_800_000, // 4.050.000 − 250.000
      delivered: 1_500_000,
      balance: 2_300_000,
      prize_cost: 450_000,
      prize_cost_org: 200_000,
      owner_gain: 3_600_000, // 4.050.000 − 450.000
      status: 'partial',
      awards: 3,
      awards_unpaid: 0,
    })
  })

  it('Z3-03: la cuenta de Ana con Carlos — $1.350.000, entregó $850.000, faltan $500.000', async () => {
    const a = await cuenta(RF, 'ana', 'carlos')
    expect(a).toMatchObject({
      tickets_sold: 16,
      tickets_paid: 15,
      collected: 1_800_000,
      holder_earned: 300_000,
      prizes_paid: 150_000,
      total_due: 1_350_000,
      delivered: 850_000,
      balance: 500_000,
      status: 'partial',
    })
    // La de Luis quedó saldada y se cerró sola al confirmar la entrega.
    const l = await cuenta(RF, 'luis', 'carlos')
    expect(l).toMatchObject({
      total_due: 1_050_000,
      delivered: 1_050_000,
      balance: 0,
      status: 'closed',
    })
    expect(l.closing_version).toBe(1)
    // El premio que pagó el dueño sobre una boleta de Luis no toca su cuenta.
    expect(l.prizes_paid).toBe(0)
  })

  it('Z3-04: el listado — recibido $3.480.000, faltan $3.020.000 de 2 cuentas, 2 de 4 cerradas', async () => {
    expect(await resumen(RF)).toMatchObject({
      accounts: 4,
      closed: 2,
      pendingAccounts: 2,
      pending: 3_020_000, // Carlos 2.300.000 + Marta 720.000
      received: 3_480_000, // Carlos 1.500.000 + Jorge 1.080.000 + Diana 900.000
      refunded: 0,
    })
  })

  it('Z3-05: recibir los $2.300.000 cierra la cuenta y el contador pasa a $5.780.000', async () => {
    const r = exito(await entregar(dueno, RF, 'carlos', 2_300_000))
    expect(r[0]).toMatchObject({ outcome: 'recorded', closed: true })
    expect(Number(r[0]!.balance_before)).toBe(2_300_000)
    expect(Number(r[0]!.balance_after)).toBe(0)

    const c = await cuenta(RF, 'carlos', null)
    expect(c).toMatchObject({
      balance: 0,
      status: 'closed',
      closing_version: 1,
      changed_after_close: false,
    })
    expect(await resumen(RF)).toMatchObject({
      closed: 3,
      pendingAccounts: 1,
      pending: 720_000,
      received: 5_780_000,
    })
    // Lo que Ana le debe a Carlos sigue igual: ya estaba dentro de la entrega.
    expect((await cuenta(RF, 'ana', 'carlos')).balance).toBe(500_000)
  })

  it('Z3-06: el cierre guarda las cifras con que quedó saldada y queda en la bitácora', async () => {
    const { rows } = await db.query(
      `select version, figures, cause, closed_by from settlement_closings
        where raffle_id = $1 and seller_id = $2 and counterpart_id is null`,
      [RF, id('carlos')],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ version: 1, cause: 'transfer', closed_by: id('dueno') })
    expect(rows[0].figures).toMatchObject({
      collected: 5_400_000,
      total_due: 3_800_000,
      delivered: 3_800_000,
      balance: 0,
    })
    const { rows: bitacora } = await db.query(
      `select action, count(*)::int as n from audit_logs
        where organization_id = $1 and action like 'settlement.%' group by action order by action`,
      [org],
    )
    const acciones = Object.fromEntries(bitacora.map((b) => [b.action, b.n]))
    expect(acciones['settlement.close']).toBeGreaterThanOrEqual(3)
    expect(acciones['settlement.transfer']).toBeGreaterThanOrEqual(5)
    expect(acciones['settlement.prize_payment']).toBeGreaterThanOrEqual(3)
  })

  it('Z3-07: lo que ve Carlos — su entrega, su cuenta y las de su equipo', async () => {
    const carlos = await sesion('carlos')
    const propia = exito(await carlos.rpc('seller_settlement_account', { p_raffle_id: RF }))[0]!
    expect(propia).toMatchObject({ counterpart_id: null, status: 'closed' })
    expect(Number(propia.holder_earned)).toBe(600_000)
    expect(Number(propia.holder_team_earned)).toBe(300_000)
    expect(Number(propia.members_earned)).toBe(450_000)
    // Lo abonado a sus 2 boletas sin pagar es SUYO: solo lo ve el (BR-Z03).
    expect(Number(propia.partial_paid)).toBe(0)

    const equipo = exito(await carlos.rpc('seller_settlement_team', { p_raffle_id: RF }))
    expect(equipo.map((e) => [e.member_name, Number(e.balance), e.status])).toEqual([
      ['Ana Gómez', 500_000, 'partial'],
      ['Luis Pérez', 0, 'closed'],
    ])

    const premiosCarlos = exito(await carlos.rpc('seller_settlement_prizes', { p_raffle_id: RF }))
    expect(premiosCarlos).toHaveLength(3)
    // El nombre del cliente, solo en su propia boleta.
    for (const p of premiosCarlos) {
      if (p.ticket_seller_id === id('carlos')) expect(p.client_name).not.toBeNull()
      else expect(p.client_name).toBeNull()
    }
  })

  it('Z3-08: lo que ve Ana — entrega a Carlos, su premio con su cliente, y nada de Carlos', async () => {
    const ana = await sesion('ana')
    const propia = exito(await ana.rpc('seller_settlement_account', { p_raffle_id: RF }))[0]!
    expect(propia).toMatchObject({ counterpart_id: id('carlos'), counterpart_name: 'Carlos Ruiz' })
    expect(Number(propia.balance)).toBe(500_000)
    expect(Number(propia.partial_paid)).toBe(0)

    const suyos = exito(await ana.rpc('seller_settlement_prizes', { p_raffle_id: RF }))
    expect(suyos).toHaveLength(1)
    expect(suyos[0]).toMatchObject({ own_ticket: true, payer_id: id('ana') })
    expect(suyos[0]!.client_name).not.toBeNull()

    const entregas = exito(await ana.rpc('seller_settlement_transfers', { p_raffle_id: RF }))
    expect(entregas.map((e) => [Number(e.amount), e.counterpart_name])).toEqual([
      [850_000, 'Carlos Ruiz'],
    ])

    // Un integrante no ve la cuenta de su vendedor a cargo ni la de nadie.
    expect(exito(await ana.rpc('seller_settlement_team', { p_raffle_id: RF }))).toEqual([])
    expect(
      exito(
        await ana.rpc('seller_settlement_account', { p_raffle_id: RF, p_member_id: id('luis') }),
      ),
    ).toEqual([])
  })
})

// =============================================================================
describe('Z4 — el motor de ganancias dentro de la cuenta', () => {
  beforeAll(async () => {
    await altaDirecta('rebaja', 'Vendedora Rebaja', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await altaDirecta('abono', 'Vendedor Abono', { mode: 'fixed_per_ticket', fixed: 30_000 })
  }, 60_000)

  it('Z4-01: una rebaja la paga quien vende — vendida en $100.000, gana $10.000 y entrega $90.000', async () => {
    await cobrar('rebaja', await vender('rebaja', RP, 1, { precio: 100_000 }))
    const c = await cuenta(RP, 'rebaja', null)
    // max(0, 30.000 − 20.000 de rebaja) = 10.000; 100.000 − 10.000 = 90.000.
    expect(c).toMatchObject({ collected: 100_000, holder_earned: 10_000, total_due: 90_000 })
  })

  it('Z4-02: una boleta sin pagar no entra; lo abonado solo lo ve su vendedor', async () => {
    const [pagada, abonada] = await vender('abono', RP, 2)
    await cobrar('abono', [pagada!])
    await cobrar('abono', [abonada!], 40_000)
    const c = await cuenta(RP, 'abono', null)
    expect(c).toMatchObject({
      tickets_sold: 2,
      tickets_paid: 1,
      collected: 120_000,
      total_due: 90_000,
    })

    const propia = exito(
      await (await sesion('abono')).rpc('seller_settlement_account', { p_raffle_id: RP }),
    )[0]!
    expect(Number(propia.partial_paid)).toBe(40_000)
    // El personal no recibe ese campo en ninguna de sus lecturas.
    const delPersonal = exito(
      await dueno.rpc('staff_settlement_account', { p_raffle_id: RP, p_seller_id: id('abono') }),
    )[0]!
    expect(Object.keys(delPersonal)).not.toContain('partial_paid')
  })
})

// =============================================================================
describe('Z5 — premios: ganado no es pagado, valor, duplicados y quién confirma', () => {
  let tvJefe: { matchId: string; prizeId: string }
  let quinceConflicto: { matchId: string; prizeId: string }
  let quinceIntegrante: { matchId: string; prizeId: string }
  let grande: { matchId: string; prizeId: string }

  beforeAll(async () => {
    await altaDirecta('pj', 'Jefe Premios', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await altaIntegrante('pi', 'Integrante Premios', 'pj', {
      model: 'fixed_per_ticket',
      amount: 20_000,
    })
    await altaDirecta('pk', 'Jefe Otro Equipo', { mode: 'fixed_per_ticket', fixed: 30_000 })
    const jefe = await vender('pj', RP, 3)
    await cobrar('pj', jefe)
    const integrante = await vender('pi', RP, 1)
    await cobrar('pi', integrante)
    tvJefe = await premiar(jefe[0]!, 'especie')
    quinceConflicto = await premiar(jefe[1]!, 'quince', { conflicto: true })
    grande = await premiar(jefe[2]!, 'grande')
    quinceIntegrante = await premiar(integrante[0]!, 'quince')
  }, 120_000)

  it('Z5-01: un premio sin pago registrado deja la cuenta en «Falta información» y no se cierra', async () => {
    // Los tres de sus boletas y el de su integrante: la cuenta incluye al equipo.
    const c = await cuenta(RP, 'pj', null)
    expect(c.status).toBe('missing_info')
    expect(c.awards).toBe(4)
    expect(c.awards_unpaid).toBe(4)
    const cierre = await dueno.rpc('settlement_confirm_close', {
      p_raffle_id: RP,
      p_seller_id: id('pj'),
      p_fingerprint: c.fingerprint,
    })
    expect(cierre.error?.message).toBe(
      'Esta cuenta todavía no se puede cerrar: falta registrar quién pagó un premio.',
    )
  })

  it('Z5-02: un premio en especie no se toma como $0 — se escribe su valor', async () => {
    const sinValor = await pagarPremio(dueno, RP, tvJefe, null)
    expect(sinValor.error?.message).toBe('Escribe el valor del premio que se pagó.')
    const r = exito(await pagarPremio(dueno, RP, tvJefe, null, { monto: 900_000 }))
    expect(r[0]!.outcome).toBe('recorded')
    const { rows } = await db.query(
      `select amount, value_was_pending from settlement_prize_payments where id = $1`,
      [r[0]!.payment_id],
    )
    expect(rows[0]).toMatchObject({ amount: '900000', value_was_pending: true })
  })

  it('Z5-03: un premio de valor conocido se registra con ese valor', async () => {
    const otro = await pagarPremio(dueno, RP, grande, 'pj', { monto: 150_000 })
    expect(otro.error?.message).toBe('Este premio vale $200.000. Registra ese valor.')
  })

  it('Z5-04: un pago por premio — el reintento no duplica y dos personas a la vez tampoco', async () => {
    const request = randomUUID()
    const primero = exito(await pagarPremio(dueno, RP, grande, 'pj', { request }))
    const reintento = exito(await pagarPremio(dueno, RP, grande, 'pj', { request }))
    expect(primero[0]!.outcome).toBe('recorded')
    expect(reintento[0]!.outcome).toBe('already_recorded')
    expect(reintento[0]!.payment_id).toBe(primero[0]!.payment_id)

    const otraVez = await pagarPremio(admin, RP, grande, null)
    expect(otraVez.error?.message).toBe('Este premio ya tiene un pago registrado.')
    const { rows } = await db.query(
      `select count(*)::int as n from settlement_prize_payments where match_id = $1 and voided_at is null`,
      [grande.matchId],
    )
    expect(rows[0].n).toBe(1)
  })

  it('Z5-05: dos registros simultáneos del mismo premio — gana uno', async () => {
    const [a, b] = await Promise.all([
      pagarPremio(dueno, RP, quinceIntegrante, null),
      pagarPremio(admin, RP, quinceIntegrante, null),
    ])
    const exitos = [a, b].filter((r) => !r.error)
    const fallos = [a, b].filter((r) => r.error)
    expect(exitos).toHaveLength(1)
    expect(fallos[0]!.error!.message).toBe('Este premio ya tiene un pago registrado.')
    // Se anula para las pruebas de autoridad de abajo, con motivo.
    const pago = exito(exitos[0]!)[0]!.payment_id!
    exito(
      await dueno.rpc('settlement_void_prize_payment', {
        p_payment_id: pago,
        p_reason: 'Registro de prueba',
      }),
    )
  })

  it('Z5-06: un resultado por verificar no se paga, y la cuenta sigue por revisar', async () => {
    const r = await pagarPremio(dueno, RP, quinceConflicto, null)
    expect(r.error?.message).toBe(
      'El resultado de ese sorteo está por verificar. Registra el pago cuando se confirme.',
    )
    // Siguen sin pago el del sorteo por verificar y el del integrante (anulado en Z5-05).
    const c = await cuenta(RP, 'pj', null)
    expect(c.status).toBe('missing_info')
    expect(c.awards_unpaid).toBe(2)
  })

  it('Z5-07: elegir un nombre no autoriza — cada pago lo registra quien recibe al pagador', async () => {
    // El integrante no registra su propio pago.
    const propio = await pagarPremio(await sesion('pi'), RP, quinceIntegrante, 'pi')
    expect(propio.error?.message).toBe(
      'Lo que pagó Integrante Premios lo registra su vendedor a cargo, Jefe Premios.',
    )
    // El personal tampoco: lo del integrante lo confirma su vendedor a cargo.
    const personal = await pagarPremio(dueno, RP, quinceIntegrante, 'pi')
    expect(personal.error?.message).toBe(
      'Lo que pagó Integrante Premios lo registra su vendedor a cargo, Jefe Premios.',
    )
    // El vendedor a cargo no registra lo que pagó él mismo.
    const jefe = await pagarPremio(await sesion('pj'), RP, quinceIntegrante, 'pj')
    expect(jefe.error?.message).toBe('Lo que pagaste tú lo registra quien recibe tus entregas.')
    // Otro vendedor a cargo no registra nada de este equipo.
    const otro = await pagarPremio(await sesion('pk'), RP, quinceIntegrante, 'pi')
    expect(otro.error?.message).toBe(
      'Lo que pagó Integrante Premios lo registra su vendedor a cargo, Jefe Premios.',
    )
    // Nadie de fuera de la cadena puede figurar como pagador.
    const ajeno = await pagarPremio(dueno, RP, quinceIntegrante, 'pk')
    expect(ajeno.error?.message).toBe(
      'Este premio lo pudo pagar Integrante Premios, su vendedor a cargo Jefe Premios o el dueño.',
    )
    // Un vendedor no registra lo que pagó el dueño.
    const vendedor = await pagarPremio(await sesion('pj'), RP, quinceIntegrante, null)
    expect(vendedor.error?.message).toBe(
      'Un premio que pagó el dueño lo registra el dueño o un administrador.',
    )
  })

  it('Z5-08: las fechas — ni antes del sorteo ni después de hoy', async () => {
    const antes = await pagarPremio(await sesion('pj'), RP, quinceIntegrante, 'pi', {
      fecha: '2026-01-02',
    })
    expect(antes.error?.message).toMatch(
      /^La fecha de pago no puede ser anterior al sorteo del \d{2}\/\d{2}\/2026\.$/,
    )
    const despues = await pagarPremio(await sesion('pj'), RP, quinceIntegrante, 'pi', {
      fecha: '2099-01-01',
    })
    expect(despues.error?.message).toBe('La fecha de pago no puede ser posterior a hoy.')
    // Y con todo en regla, el vendedor a cargo lo registra.
    const r = exito(await pagarPremio(await sesion('pj'), RP, quinceIntegrante, 'pi'))
    expect(r[0]!.outcome).toBe('recorded')
    expect((await cuenta(RP, 'pi', 'pj')).balance).toBe(85_000)
  })

  it('Z5-09: anular un pago de premio lo saca de la cuenta y solo lo anula quien podía registrarlo', async () => {
    const { rows } = await db.query(
      `select id from settlement_prize_payments where match_id = $1 and voided_at is null`,
      [quinceIntegrante.matchId],
    )
    const pago = rows[0].id as string
    const ajeno = await dueno.rpc('settlement_void_prize_payment', {
      p_payment_id: pago,
      p_reason: 'No corresponde',
    })
    expect(ajeno.error?.message).toBe(
      'Lo que pagó Integrante Premios lo registra su vendedor a cargo, Jefe Premios.',
    )
    const corto = await (
      await sesion('pj')
    ).rpc('settlement_void_prize_payment', { p_payment_id: pago, p_reason: 'no' })
    expect(corto.error?.message).toBe('Escribe el motivo de la anulación, de 5 a 500 caracteres.')
    exito(
      await (
        await sesion('pj')
      ).rpc('settlement_void_prize_payment', {
        p_payment_id: pago,
        p_reason: 'Lo pagó otra persona',
      }),
    )
    const c = await cuenta(RP, 'pi', 'pj')
    expect(c.balance).toBe(100_000)
    expect(c.status).toBe('missing_info')
  })
})

// =============================================================================
describe('Z6 — entregas: parciales, quién confirma, reintentos, concurrencia y saldo a favor', () => {
  beforeAll(async () => {
    await altaDirecta('ej', 'Jefe Entregas', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await altaIntegrante('ei', 'Integrante Entregas', 'ej', {
      model: 'fixed_per_ticket',
      amount: 20_000,
    })
    await altaDirecta('ec', 'Vendedor Concurrente', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await altaDirecta('favor', 'Vendedora Favor', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await cobrar('ej', await vender('ej', RP, 10))
    await cobrar('ei', await vender('ei', RP, 5))
    await cobrar('ec', await vender('ec', RP, 4))
  }, 120_000)

  it('Z6-01: una entrega parcial deja la cuenta en «Entrega parcial» y suma a «Recibido»', async () => {
    // Jefe: 10 × 90.000 + 5 × (100.000 − 10.000) = 900.000 + 450.000 = 1.350.000
    expect((await cuenta(RP, 'ej', null)).balance).toBe(1_350_000)
    const antes = (await resumen(RP)).received
    const r = exito(await entregar(dueno, RP, 'ej', 350_000))
    expect(r[0]).toMatchObject({ outcome: 'recorded', closed: false })
    const c = await cuenta(RP, 'ej', null)
    expect(c).toMatchObject({ balance: 1_000_000, delivered: 350_000, status: 'partial' })
    expect((await resumen(RP)).received).toBe(antes + 350_000)
  })

  it('Z6-02: lo confirma quien recibe — y una entrega interna no suma a «Recibido»', async () => {
    const antes = (await resumen(RP)).received
    // El integrante entrega a su vendedor a cargo: el personal no puede confirmarlo.
    const personal = await entregar(dueno, RP, 'ei', 100_000)
    expect(personal.error?.message).toBe(
      'Lo que entrega Integrante Entregas lo confirma su vendedor a cargo, Jefe Entregas.',
    )
    // Ni el propio integrante.
    const propio = await entregar(await sesion('ei'), RP, 'ei', 100_000)
    expect(propio.error?.message).toBe(
      'Una entrega la confirma quien recibe el dinero, no quien lo entrega.',
    )
    // Ni el vendedor a cargo lo que él entrega al dueño.
    const jefe = await entregar(await sesion('ej'), RP, 'ej', 100_000)
    expect(jefe.error?.message).toBe(
      'Una entrega la confirma quien recibe el dinero, no quien lo entrega.',
    )
    // Ni otro vendedor a cargo.
    const otro = await entregar(await sesion('pk'), RP, 'ei', 100_000)
    expect(otro.error?.message).toBe(
      'Lo que entrega Integrante Entregas lo confirma su vendedor a cargo, Jefe Entregas.',
    )
    // Un vendedor no confirma lo que recibe el dueño.
    const vendedor = await entregar(await sesion('ec'), RP, 'ej', 100_000)
    expect(vendedor.error?.message).toBe(
      'Solo el dueño o un administrador confirma el dinero que recibe de un vendedor.',
    )

    exito(await entregar(await sesion('ej'), RP, 'ei', 100_000))
    // El integrante entrega 5 × (120.000 − 20.000); el jefe se queda sus 10.000 por boleta.
    expect((await cuenta(RP, 'ei', 'ej')).balance).toBe(400_000) // 500.000 − 100.000
    // La cuenta con el dueño no cambia, y «Recibido» tampoco.
    expect((await cuenta(RP, 'ej', null)).balance).toBe(1_000_000)
    expect((await resumen(RP)).received).toBe(antes)
  })

  it('Z6-03: los importes y las fechas se validan en la base', async () => {
    const demasiado = await entregar(dueno, RP, 'ej', 1_000_001)
    expect(demasiado.error?.message).toBe(
      'No puedes confirmar más de $1.000.000: es lo que falta por recibir.',
    )
    const cero = await entregar(dueno, RP, 'ej', 0)
    expect(cero.error?.message).toBe('Escribe cuánto dinero recibiste.')
    const futura = await entregar(dueno, RP, 'ej', 1_000, { fecha: '2099-01-01' })
    expect(futura.error?.message).toBe('La fecha no puede ser posterior a hoy.')
    const vieja = await entregar(dueno, RP, 'ej', 1_000, { fecha: '2025-12-31' })
    expect(vieja.error?.message).toBe(
      'La fecha no puede ser anterior al inicio de la rifa (01/01/2026).',
    )
    const devolucion = await entregar(await sesion('ej'), RP, 'ej', 1_000, { kind: 'refund' })
    expect(devolucion.error?.message).toBe('Esta cuenta no tiene saldo a favor del vendedor.')
  })

  it('Z6-04: el reintento con la misma solicitud no escribe dos veces', async () => {
    const request = randomUUID()
    const esperado = (await cuenta(RP, 'ej', null)).balance
    const primero = exito(await entregar(dueno, RP, 'ej', 200_000, { request, esperado }))
    // El segundo llega con el saldo VIEJO, como un doble clic: no es un cambio, es el mismo.
    const segundo = exito(await entregar(dueno, RP, 'ej', 200_000, { request, esperado }))
    expect(primero[0]!.outcome).toBe('recorded')
    expect(segundo[0]).toMatchObject({
      outcome: 'already_recorded',
      transfer_id: primero[0]!.transfer_id,
    })
    const { rows } = await db.query(
      `select count(*)::int as n from settlement_transfers where request_id = $1`,
      [request],
    )
    expect(rows[0].n).toBe(1)
    // La misma solicitud con otros datos se rechaza.
    const otra = await entregar(dueno, RP, 'ej', 1_000, { request })
    expect(otra.error?.message).toBe(
      'Esta confirmación ya se había enviado con otros datos. Vuelve a abrir la cuenta.',
    )
  })

  it('Z6-05: si el saldo cambió mientras se revisaba, no se guarda nada', async () => {
    const actual = (await cuenta(RP, 'ej', null)).balance
    const r = exito(await entregar(dueno, RP, 'ej', 100_000, { esperado: actual + 90_000 }))
    expect(r[0]).toMatchObject({ outcome: 'balance_changed', transfer_id: null })
    expect(Number(r[0]!.current_balance)).toBe(actual)
    expect((await cuenta(RP, 'ej', null)).balance).toBe(actual)
  })

  it('Z6-06: dos confirmaciones simultáneas — una se guarda y la otra ve el saldo nuevo', async () => {
    const saldo = (await cuenta(RP, 'ec', null)).balance
    expect(saldo).toBe(360_000)
    const [a, b] = await Promise.all([
      entregar(dueno, RP, 'ec', saldo, { esperado: saldo }),
      entregar(admin, RP, 'ec', saldo, { esperado: saldo }),
    ])
    const resultados = [exito(a)[0]!.outcome, exito(b)[0]!.outcome].sort()
    expect(resultados).toEqual(['balance_changed', 'recorded'])
    const c = await cuenta(RP, 'ec', null)
    expect(c).toMatchObject({ delivered: 360_000, balance: 0, status: 'closed' })
  })

  it('Z6-07: saldo a favor del vendedor — la devolución la confirma quien la recibe y no suma a «Recibido»', async () => {
    const [boleta] = await vender('favor', RP, 1)
    await cobrar('favor', [boleta!])
    exito(await entregar(dueno, RP, 'favor', 90_000))
    expect((await cuenta(RP, 'favor', null)).status).toBe('closed')

    // Pagó de su bolsillo un premio en especie de $200.000.
    const tv = await premiar(boleta!, 'especie')
    exito(await pagarPremio(dueno, RP, tv, 'favor', { monto: 200_000 }))
    const c = await cuenta(RP, 'favor', null)
    expect(c).toMatchObject({ balance: -200_000, status: 'in_favor', changed_after_close: true })

    const antes = await resumen(RP)
    // El dueño no registra que devolvió: lo confirma quien recibe.
    const personal = await entregar(dueno, RP, 'favor', 200_000, { kind: 'refund' })
    expect(personal.error?.message).toBe('Una devolución la confirma quien recibe el dinero.')
    const r = exito(await entregar(await sesion('favor'), RP, 'favor', 200_000, { kind: 'refund' }))
    expect(r[0]).toMatchObject({ outcome: 'recorded', closed: true })

    const despues = await resumen(RP)
    expect(despues.received).toBe(antes.received)
    expect(despues.refunded).toBe(antes.refunded + 200_000)
    expect(await cuenta(RP, 'favor', null)).toMatchObject({
      balance: 0,
      status: 'closed',
      closing_version: 2,
    })
  })
})

// =============================================================================
describe('Z7 — cierres: la foto no cambia y lo posterior se enseña como diferencia', () => {
  beforeAll(async () => {
    await altaDirecta('cz', 'Vendedor Cierre', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await altaDirecta('aj', 'Vendedor Ajuste', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await cobrar('cz', await vender('cz', RP, 2))
    await cobrar('aj', await vender('aj', RP, 1))
  }, 60_000)

  it('Z7-01: una venta cobrada después del cierre cambia la cuenta sin tocar el cierre', async () => {
    exito(await entregar(dueno, RP, 'cz', 180_000))
    const { rows: antes } = await db.query(
      `select * from settlement_closings where seller_id = $1`,
      [id('cz')],
    )
    expect(antes).toHaveLength(1)

    await cobrar('cz', await vender('cz', RP, 1))
    const c = await cuenta(RP, 'cz', null)
    // Ya había entregado algo: la cuenta queda en «Entrega parcial», no en «Pendiente».
    expect(c).toMatchObject({
      balance: 90_000,
      status: 'partial',
      changed_after_close: true,
      closing_version: 1,
    })

    const { rows: despues } = await db.query(
      `select * from settlement_closings where seller_id = $1`,
      [id('cz')],
    )
    expect(despues).toEqual(antes)

    exito(await entregar(dueno, RP, 'cz', 90_000))
    expect(await cuenta(RP, 'cz', null)).toMatchObject({
      status: 'closed',
      closing_version: 2,
      changed_after_close: false,
    })
  })

  it('Z7-02: anular una entrega devuelve el saldo; solo la anula quien la recibió', async () => {
    const { rows } = await db.query(
      `select id from settlement_transfers where seller_id = $1 and voided_at is null order by confirmed_at desc limit 1`,
      [id('cz')],
    )
    const entrega = rows[0].id as string
    const vendedor = await (
      await sesion('cz')
    ).rpc('settlement_void_transfer', { p_transfer_id: entrega, p_reason: 'Me equivoqué' })
    expect(vendedor.error?.message).toBe(
      'Solo el dueño o un administrador anula lo que confirmó como recibido.',
    )
    exito(
      await admin.rpc('settlement_void_transfer', {
        p_transfer_id: entrega,
        p_reason: 'Billete falso devuelto',
      }),
    )
    const c = await cuenta(RP, 'cz', null)
    expect(c).toMatchObject({ balance: 90_000, status: 'partial', changed_after_close: true })
    const otraVez = await admin.rpc('settlement_void_transfer', {
      p_transfer_id: entrega,
      p_reason: 'Otra vez',
    })
    expect(otraVez.error?.message).toBe('Esta entrega ya está anulada.')
  })

  it('Z7-03: un cambio de acuerdo que deja la cuenta en cero pide cerrarla a mano, con la huella a la vista', async () => {
    exito(await entregar(dueno, RP, 'aj', 60_000))
    expect((await cuenta(RP, 'aj', null)).balance).toBe(30_000)
    // El personal le sube la ganancia a $60.000: el motor recalcula (BR-G31).
    exito(
      await dueno.rpc('staff_set_seller_agreement', {
        p_seller_id: id('aj'),
        p_mode: 'fixed_per_ticket',
        p_fixed_amount: 60_000,
      }),
    )
    const c = await cuenta(RP, 'aj', null)
    expect(c).toMatchObject({ holder_earned: 60_000, balance: 0, status: 'to_close' })

    const vendedor = await (
      await sesion('aj')
    ).rpc('settlement_confirm_close', {
      p_raffle_id: RP,
      p_seller_id: id('aj'),
      p_fingerprint: c.fingerprint,
    })
    expect(vendedor.error?.message).toBe(
      'Solo el dueño o un administrador cierra la cuenta de un vendedor.',
    )
    const vieja = exito(
      await dueno.rpc('settlement_confirm_close', {
        p_raffle_id: RP,
        p_seller_id: id('aj'),
        p_fingerprint: '0'.repeat(32),
      }),
    )
    expect(vieja).toBe('changed')
    const ok = exito(
      await dueno.rpc('settlement_confirm_close', {
        p_raffle_id: RP,
        p_seller_id: id('aj'),
        p_fingerprint: c.fingerprint,
      }),
    )
    expect(ok).toBe('closed')
    expect((await cuenta(RP, 'aj', null)).status).toBe('closed')
    // Cerrar una cuenta no cierra la rifa (BR-Z11).
    const { rows } = await db.query(`select status from raffles where id = $1`, [RP])
    expect(rows[0].status).toBe('active')
  })

  it('Z7-04: anular el pago de un cliente después del cierre deja saldo a favor del vendedor', async () => {
    const { rows } = await db.query(
      `select p.id from payments p where p.seller_id = $1 and p.voided_at is null order by p.created_at desc limit 1`,
      [id('aj')],
    )
    await voidPaymentAs(id('dueno'), rows[0].id, 'Pago rechazado por el banco')
    const c = await cuenta(RP, 'aj', null)
    // Ya no hay boletas pagadas, y ya había entregado $60.000.
    expect(c).toMatchObject({
      tickets_paid: 0,
      balance: -60_000,
      status: 'in_favor',
      changed_after_close: true,
    })
  })

  it('Z7-05: los cierres, las entregas y los pagos de premio no se modifican ni se borran', async () => {
    await expect(
      db.query(`update settlement_closings set version = 9 where seller_id = $1`, [id('cz')]),
    ).rejects.toThrow('Un cierre no se modifica')
    await expect(
      db.query(`delete from settlement_transfers where seller_id = $1`, [id('cz')]),
    ).rejects.toThrow('no se borran')
    const { rows: vigente } = await db.query(
      `select id from settlement_transfers where organization_id = $1 and voided_at is null limit 1`,
      [org],
    )
    await expect(
      db.query(`update settlement_transfers set amount = 1 where id = $1`, [vigente[0].id]),
    ).rejects.toThrow('solo se puede escribir su anulación')
    const { rows: pago } = await db.query(
      `select id from settlement_prize_payments where organization_id = $1 limit 1`,
      [org],
    )
    await expect(
      db.query(`delete from settlement_prize_payments where id = $1`, [pago[0].id]),
    ).rejects.toThrow('no se borran')
  })
})

// =============================================================================
describe('Z8 — cambio de equipo: lo cobrado se queda con quien lo recibió', () => {
  it('Z8-01: el nuevo vendedor a cargo no hereda lo que el integrante ya entregó al anterior', async () => {
    await altaDirecta('ta', 'Jefe Anterior', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await altaDirecta('tb', 'Jefe Nuevo', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await altaIntegrante('tm', 'Integrante Viajero', 'ta', {
      model: 'fixed_per_ticket',
      amount: 20_000,
    })
    await cobrar('tm', await vender('tm', RP, 2))

    // 2 × (120.000 − 20.000) = 200.000 para su vendedor a cargo; entrega la mitad.
    expect((await cuenta(RP, 'tm', 'ta')).balance).toBe(200_000)
    exito(await entregar(await sesion('ta'), RP, 'tm', 100_000))
    // El jefe anterior debe al dueño 200.000 − 2 × 10.000 = 180.000.
    expect((await cuenta(RP, 'ta', null)).balance).toBe(180_000)

    // El personal lo cambia de equipo (BR-E08).
    const { error } = await dueno
      .from('memberships')
      .update({ parent_seller_id: id('tb') })
      .eq('organization_id', org)
      .eq('profile_id', id('tm'))
    expect(error).toBeNull()

    // El motor reasigna la ganancia de equipo al nuevo (BR-G31); el dinero no.
    expect((await comision('ta', RP)).teamEarned).toBe(0)
    expect((await comision('tb', RP)).teamEarned).toBe(20_000)

    // El anterior TIENE los 100.000 que recibió y ya no gana nada por ellos.
    const anterior = await cuenta(RP, 'ta', null)
    expect(anterior).toMatchObject({
      other_movements: 100_000,
      total_due: 100_000,
      balance: 100_000,
    })
    // El nuevo responde solo por lo que falta: 200.000 − 20.000 − 100.000 entregados a otro.
    const nuevo = await cuenta(RP, 'tb', null)
    expect(nuevo).toMatchObject({
      collected: 240_000,
      other_movements: -100_000,
      total_due: 80_000,
      balance: 80_000,
    })
    // Y el integrante le debe al nuevo lo que no había entregado.
    expect(await cuenta(RP, 'tm', 'tb')).toMatchObject({
      other_movements: -100_000,
      balance: 100_000,
    })
    // El dinero se conserva: 100.000 + 80.000 = 240.000 − 40.000 − 20.000.
    expect(anterior.balance + nuevo.balance).toBe(240_000 - 40_000 - 20_000)
  })
})

// =============================================================================
describe('Z9 — privacidad y aislamiento', () => {
  const CAMPOS_DE_CARTERA = /client|partial_paid|abon|sale_price|paid_amount|phone|email/

  it('Z9-01: las lecturas del personal no traen ni un campo de cliente ni de abonos', async () => {
    const filas = [
      ...exito(await dueno.rpc('staff_settlement_accounts', { p_raffle_id: RF })),
      ...exito(
        await dueno.rpc('staff_settlement_account', { p_raffle_id: RF, p_seller_id: id('carlos') }),
      ),
      ...exito(
        await dueno.rpc('staff_settlement_prizes', { p_raffle_id: RF, p_seller_id: id('carlos') }),
      ),
      ...exito(
        await dueno.rpc('staff_settlement_transfers', {
          p_raffle_id: RF,
          p_seller_id: id('carlos'),
        }),
      ),
      ...exito(await dueno.rpc('staff_settlement_overview', { p_raffle_id: RF })),
    ]
    expect(filas.length).toBeGreaterThan(5)
    for (const fila of filas) {
      for (const campo of Object.keys(fila)) expect(campo).not.toMatch(CAMPOS_DE_CARTERA)
    }
  })

  it('Z9-02: el vendedor a cargo ve las cifras de su integrante, sin clientes ni abonos', async () => {
    const carlos = await sesion('carlos')
    const cuentaAna = exito(
      await carlos.rpc('seller_settlement_account', { p_raffle_id: RF, p_member_id: id('ana') }),
    )[0]!
    expect(Number(cuentaAna.balance)).toBe(500_000)
    expect(cuentaAna.partial_paid).toBeNull()
    const premiosAna = exito(
      await carlos.rpc('seller_settlement_prizes', { p_raffle_id: RF, p_member_id: id('ana') }),
    )
    expect(premiosAna).toHaveLength(1)
    expect(premiosAna[0]!.client_name).toBeNull()
    // No ve al integrante de otro equipo.
    expect(
      exito(
        await carlos.rpc('seller_settlement_account', { p_raffle_id: RP, p_member_id: id('ei') }),
      ),
    ).toEqual([])
    expect(
      exito(
        await carlos.rpc('seller_settlement_prizes', { p_raffle_id: RP, p_member_id: id('ei') }),
      ),
    ).toEqual([])
    expect(
      exito(
        await carlos.rpc('seller_settlement_transfers', { p_raffle_id: RP, p_member_id: id('ei') }),
      ),
    ).toEqual([])
  })

  it('Z9-03: un vendedor no obtiene nada de las lecturas del personal', async () => {
    const carlos = await sesion('carlos')
    expect(exito(await carlos.rpc('staff_settlement_overview', { p_raffle_id: RF }))).toEqual([])
    expect(exito(await carlos.rpc('staff_settlement_accounts', { p_raffle_id: RF }))).toEqual([])
    expect(
      exito(
        await carlos.rpc('staff_settlement_account', {
          p_raffle_id: RF,
          p_seller_id: id('carlos'),
        }),
      ),
    ).toEqual([])
  })

  it('Z9-04: otra organización no ve ni escribe nada de esta', async () => {
    const ajenos = [await sesion('dueno2'), await signInAs(USERS.owner), await sesion('ajeno')]
    for (const ajeno of ajenos) {
      expect(exito(await ajeno.rpc('staff_settlement_overview', { p_raffle_id: RF }))).toEqual([])
      expect(exito(await ajeno.rpc('staff_settlement_accounts', { p_raffle_id: RF }))).toEqual([])
      expect(exito(await ajeno.rpc('seller_settlement_account', { p_raffle_id: RF }))).toEqual([])
      expect(exito(await ajeno.rpc('seller_settlement_prizes', { p_raffle_id: RF }))).toEqual([])
      const escritura = await entregar(ajeno, RF, 'marta', 1_000, { esperado: 720_000 })
      expect(escritura.error?.message).toBe(
        'No encontramos esa cuenta. Vuelve a abrir el cierre de cuentas.',
      )
    }
    expect((await cuenta(RF, 'marta', null)).balance).toBe(720_000)
  })

  it('Z9-05: un vendedor sin equipo no ve cuentas de nadie más', async () => {
    const marta = await sesion('marta')
    expect(exito(await marta.rpc('seller_settlement_team', { p_raffle_id: RF }))).toEqual([])
    expect(
      exito(
        await marta.rpc('seller_settlement_account', { p_raffle_id: RF, p_member_id: id('ana') }),
      ),
    ).toEqual([])
    const propia = exito(await marta.rpc('seller_settlement_account', { p_raffle_id: RF }))
    expect(propia).toHaveLength(1)
    expect(Number(propia[0]!.balance)).toBe(720_000)
  })
})

// =============================================================================
// PUESTA EN MARCHA (revision previa a publicar, 2026-09-30). La cuenta suma
// TODAS las boletas pagadas de la rifa, asi que lo ocurrido antes de estrenar
// el cierre se registra como ocurrio: con su fecha y confirmado por quien
// recibio. Nada se inventa ni se pone en cero.
// =============================================================================

/** Una rifa propia por bloque, con cuatro premios en meses distintos (BR-J08). */
async function rifaConPremios(nombre: string, prefijo: string) {
  const rifa = await nuevaRifa(nombre)
  const importes: Array<[string, number, string]> = [
    ['20', 20_000, '03'],
    ['30', 30_000, '04'],
    ['50', 50_000, '05'],
    ['80', 80_000, '06'],
  ]
  for (const [clave, monto, mes] of importes) {
    await premio(
      rifa,
      `${prefijo}${clave}`,
      `Premio ${clave} ${prefijo}`,
      {
        opciones: [{ description: null, amount: monto }],
      },
      mes,
    )
  }
  await activar(rifa)
  return rifa
}

async function transferencias(raffleId: string, titular: string) {
  const { rows } = await db.query(
    `select kind::text as kind, amount::bigint as amount, received_on::text as received_on,
            counterpart_id, confirmed_by, voided_at
       from settlement_transfers where raffle_id = $1 and seller_id = $2
      order by received_on, confirmed_at`,
    [raffleId, id(titular)],
  )
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }))
}

async function desactivar(clave: string, activo = false) {
  const { data, error } = await dueno
    .from('memberships')
    .update({ is_active: activo })
    .eq('organization_id', org)
    .eq('profile_id', id(clave))
    .select('id')
  if (error) throw new Error(error.message)
  expect(data).toHaveLength(1)
}

async function cambiarDeEquipo(clave: string, padre: string | null) {
  const { error } = await dueno
    .from('memberships')
    .update({ parent_seller_id: padre === null ? null : id(padre) })
    .eq('organization_id', org)
    .eq('profile_id', id(clave))
  if (error) throw new Error(error.message)
}

describe('Z10 — puesta en marcha: lo anterior se registra como ocurrió, y el saldo es lo que de verdad falta', () => {
  let RM: string
  let hh: string[]
  let hm: string[]
  let hd: string[]
  const A: Record<string, { matchId: string; prizeId: string; fecha: string }> = {}

  beforeAll(async () => {
    RM = await rifaConPremios('Rifa puesta en marcha', 'pm')
    await altaDirecta('hh', 'Jefe Histórico', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await altaIntegrante('hm', 'Integrante Histórico', 'hh', {
      model: 'fixed_per_ticket',
      amount: 20_000,
    })
    await altaDirecta('hd', 'Directo Histórico', { mode: 'fixed_per_ticket', fixed: 25_000 })
    hh = await vender('hh', RM, 10)
    hm = await vender('hm', RM, 8)
    hd = await vender('hd', RM, 6)
    await cobrar('hh', hh)
    await cobrar('hm', hm)
    await cobrar('hd', hd)
    // Premios ganados antes de estrenar el cierre, y quién los pagó de verdad:
    A.integrantePagoIntegrante = await premiar(hm[0]!, 'pm20') // lo pagó el integrante
    A.integrantePagoJefe = await premiar(hm[1]!, 'pm30') // lo pagó el vendedor a cargo
    A.jefePagoDueno = await premiar(hh[0]!, 'pm50') // lo pagó el dueño
    A.directoPagoDirecto = await premiar(hd[0]!, 'pm80') // lo pagó el vendedor directo
  }, 180_000)

  it('Z10-01: «empezar desde hoy» pediría otra vez lo ya entregado —la cuenta suma todas las boletas pagadas—', async () => {
    // Integrante: 8 × 120.000 − 8 × 20.000 = 800.000, con dos premios sin registrar.
    expect(await cuenta(RM, 'hm', 'hh')).toMatchObject({ balance: 800_000, status: 'missing_info' })
    // Jefe con su equipo: 18 × 120.000 = 2.160.000 − (300.000 + 80.000 + 160.000) = 1.620.000.
    expect(await cuenta(RM, 'hh', null)).toMatchObject({
      collected: 2_160_000,
      total_due: 1_620_000,
      balance: 1_620_000,
      status: 'missing_info',
    })
    // Directo: 6 × 120.000 − 6 × 25.000 = 570.000.
    expect(await cuenta(RM, 'hd', null)).toMatchObject({ balance: 570_000, status: 'missing_info' })
    // Si ya se entregaron 1.000.000 y se pagaron 50.000 en premios, lo que de
    // verdad falta es 570.000: sin registrar lo anterior, la pantalla pediría
    // 1.050.000 que ya no están en manos del vendedor.
  })

  it('Z10-02: cada hecho anterior se registra con su fecha real y por quien lo recibió o lo puede confirmar', async () => {
    const jefe = await sesion('hh')
    // Los premios, cada uno por quien recibe las entregas de quien lo pagó (BR-Z07).
    exito(await pagarPremio(dueno, RM, A.jefePagoDueno!, null, { fecha: A.jefePagoDueno!.fecha }))
    exito(
      await pagarPremio(jefe, RM, A.integrantePagoIntegrante!, 'hm', {
        fecha: A.integrantePagoIntegrante!.fecha,
      }),
    )
    exito(
      await pagarPremio(dueno, RM, A.integrantePagoJefe!, 'hh', {
        fecha: A.integrantePagoJefe!.fecha,
      }),
    )
    // Las entregas: la del integrante la confirma su vendedor a cargo; la del
    // vendedor a cargo, el personal. Fechas del mes pasado, no la de hoy.
    exito(await entregar(jefe, RM, 'hm', 500_000, { fecha: '2026-08-20' }))
    exito(await entregar(dueno, RM, 'hh', 1_000_000, { fecha: '2026-08-28' }))

    // El directo, al revés: primero la entrega y después el premio. El orden no
    // cambia el resultado. Y una equivocación al registrar se anula con motivo.
    const errada = exito(await entregar(dueno, RM, 'hd', 30_000, { fecha: '2026-08-20' }))
    exito(
      await dueno.rpc('settlement_void_transfer', {
        p_transfer_id: errada[0]!.transfer_id,
        p_reason: 'Eran 300.000, no 30.000',
      }),
    )
    exito(await entregar(dueno, RM, 'hd', 300_000, { fecha: '2026-08-20' }))
    exito(
      await pagarPremio(dueno, RM, A.directoPagoDirecto!, 'hd', {
        fecha: A.directoPagoDirecto!.fecha,
      }),
    )

    // Lo que de verdad falta, a mano:
    //   integrante: 960.000 − 160.000 − 20.000 (su premio) − 500.000 entregados = 280.000
    expect(await cuenta(RM, 'hm', 'hh')).toMatchObject({
      delivered: 500_000,
      prizes_paid: 20_000,
      balance: 280_000,
      status: 'partial',
    })
    //   jefe y equipo: 1.620.000 − 50.000 (premios que pagaron) − 1.000.000 = 570.000
    expect(await cuenta(RM, 'hh', null)).toMatchObject({
      prizes_paid: 50_000,
      delivered: 1_000_000,
      balance: 570_000,
      status: 'partial',
      prize_cost: 100_000,
      prize_cost_org: 50_000,
      // Ganancia del dueño: 1.620.000 − los tres premios de sus boletas (100.000).
      owner_gain: 1_520_000,
    })
    //   directo: 570.000 − 300.000 − 80.000 = 190.000
    expect(await cuenta(RM, 'hd', null)).toMatchObject({
      delivered: 300_000,
      prizes_paid: 80_000,
      balance: 190_000,
      status: 'partial',
    })
    // «Recibido» es solo lo que llegó al dueño: la entrega interna no suma.
    expect(await resumen(RM)).toMatchObject({
      received: 1_300_000,
      pending: 760_000,
      pendingAccounts: 2,
      closed: 0,
    })
    // Cada entrega conserva su fecha real, quién la recibió y quién la confirmó.
    expect(await transferencias(RM, 'hm')).toEqual([
      expect.objectContaining({
        amount: 500_000,
        received_on: '2026-08-20',
        counterpart_id: id('hh'),
        confirmed_by: id('hh'),
        voided_at: null,
      }),
    ])
    const delDirecto = await transferencias(RM, 'hd')
    expect(delDirecto.map((t) => [t.amount, t.received_on, t.voided_at === null])).toEqual([
      [30_000, '2026-08-20', false],
      [300_000, '2026-08-20', true],
    ])
  }, 120_000)

  it('Z10-03: lo posterior se suma encima, y la cuenta se cierra cuando de verdad no falta nada', async () => {
    const jefe = await sesion('hh')
    // Ventas nuevas: 2 del integrante y 1 del jefe.
    await cobrar('hm', await vender('hm', RM, 2))
    await cobrar('hh', await vender('hh', RM, 1))
    //   integrante: 280.000 + 2 × (120.000 − 20.000) = 480.000
    expect((await cuenta(RM, 'hm', 'hh')).balance).toBe(480_000)
    //   jefe y equipo: 570.000 + 2 × 90.000 (120.000 − 20.000 − 10.000) + 90.000 = 840.000
    expect((await cuenta(RM, 'hh', null)).balance).toBe(840_000)

    // El integrante entrega lo que le falta: su cuenta se cierra sola; la del
    // jefe con el dueño no cambia, porque ese dinero ya estaba dentro.
    exito(await entregar(jefe, RM, 'hm', 480_000))
    expect(await cuenta(RM, 'hm', 'hh')).toMatchObject({ balance: 0, status: 'closed' })
    expect((await cuenta(RM, 'hh', null)).balance).toBe(840_000)

    // Un premio nuevo que paga el dueño: baja su ganancia, no la entrega.
    const nuevo = await premiar(hh[1]!, 'pm20')
    exito(await pagarPremio(dueno, RM, nuevo, null, { fecha: nuevo.fecha }))
    expect(await cuenta(RM, 'hh', null)).toMatchObject({
      balance: 840_000,
      // (11 × 120.000 + 10 × 120.000) − (330.000 + 100.000 + 200.000) − 120.000 en premios
      owner_gain: 1_770_000,
    })

    exito(await entregar(dueno, RM, 'hh', 840_000))
    exito(await entregar(dueno, RM, 'hd', 190_000))
    expect((await cuenta(RM, 'hh', null)).status).toBe('closed')
    expect((await cuenta(RM, 'hd', null)).status).toBe('closed')

    // Todo cuadra con el dinero de verdad: lo cobrado (27 boletas pagadas × 120.000
    // = 3.240.000) menos las ganancias (780.000) y los premios que pagaron los
    // vendedores (130.000) es exactamente lo que recibió el dueño.
    expect(await resumen(RM)).toMatchObject({
      received: 2_330_000,
      pending: 0,
      closed: 2,
    })
    expect(3_240_000 - 780_000 - 130_000).toBe(2_330_000)
  }, 120_000)
})

describe('Z11 — una entrega mayor que el saldo no se puede registrar (abonos o dinero bruto)', () => {
  let RA: string

  beforeAll(async () => {
    RA = await rifaConPremios('Rifa entregas de más', 'pa')
  }, 60_000)

  it('Z11-01: entregó abonos de boletas que aún no están pagadas: hoy no cabe, y cabe cuando se pagan', async () => {
    await altaDirecta('ab', 'Vendedora Con Abonos', { mode: 'fixed_per_ticket', fixed: 25_000 })
    const [p1, p2, p3, m1, m2] = await vender('ab', RA, 5)
    await cobrar('ab', [p1!, p2!, p3!])
    await cobrar('ab', [m1!, m2!], 60_000)
    // Solo cuentan las 3 pagadas: 360.000 − 75.000 = 285.000. Los 120.000 de
    // abonos son cartera de la vendedora (BR-Z02, BR-Z03).
    expect(await cuenta(RA, 'ab', null)).toMatchObject({ balance: 285_000, status: 'pending' })

    // En la realidad entregó 400.000: incluía 115.000 de esos abonos.
    const deMas = await entregar(dueno, RA, 'ab', 400_000, { fecha: '2026-08-25' })
    expect(deMas.error?.message).toBe(
      'No puedes confirmar más de $285.000: es lo que falta por recibir.',
    )
    expect(await transferencias(RA, 'ab')).toEqual([])

    // Cuando las dos boletas se terminan de pagar, lo entregado ya cabe con su fecha
    // real y el saldo es exacto: 600.000 − 125.000 − 400.000 = 75.000.
    await cobrar('ab', [m1!, m2!], 60_000)
    exito(await entregar(dueno, RA, 'ab', 400_000, { fecha: '2026-08-25' }))
    expect(await cuenta(RA, 'ab', null)).toMatchObject({ balance: 75_000, status: 'partial' })
  }, 120_000)

  it('Z11-02: entregó el dinero bruto y el dueño le devolvió su ganancia: no se puede registrar como pasó', async () => {
    await altaDirecta('br', 'Vendedor Bruto', { mode: 'fixed_per_ticket', fixed: 25_000 })
    await cobrar('br', await vender('br', RA, 4))
    // 480.000 − 100.000 = 380.000 por entregar.
    expect((await cuenta(RA, 'br', null)).balance).toBe(380_000)
    // Entregó los 480.000 y el dueño le devolvió 100.000 de ganancia.
    const bruto = await entregar(dueno, RA, 'br', 480_000, { fecha: '2026-08-25' })
    expect(bruto.error?.message).toBe(
      'No puedes confirmar más de $380.000: es lo que falta por recibir.',
    )
    const devolucion = await entregar(await sesion('br'), RA, 'br', 100_000, {
      kind: 'refund',
      fecha: '2026-08-26',
    })
    expect(devolucion.error?.message).toBe('Esta cuenta no tiene saldo a favor del vendedor.')
    // Solo cabe el neto, que no es lo que pasó: dos movimientos se volverían uno.
    expect(await transferencias(RA, 'br')).toEqual([])
  }, 120_000)
})

describe('Z12 — vendedor a cargo desactivado (I-196): reorganizar no conserva quién recibió', () => {
  let RZ: string

  beforeAll(async () => {
    RZ = await rifaConPremios('Rifa vendedor a cargo desactivado', 'pz')
  }, 60_000)

  it('Z12-01: desactivado, nadie confirma lo que le entregó su equipo; lo del dueño sí se registra', async () => {
    await altaDirecta('ra', 'Jefe Que Se Va', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await altaDirecta('rn', 'Jefe Que Llega', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await altaIntegrante('rm', 'Integrante Del Que Se Va', 'ra', {
      model: 'fixed_per_ticket',
      amount: 20_000,
    })
    const delIntegrante = await vender('rm', RZ, 5)
    const delJefe = await vender('ra', RZ, 2)
    await cobrar('rm', delIntegrante)
    await cobrar('ra', delJefe)
    const premioIntegrante = await premiar(delIntegrante[0]!, 'pz20') // lo pagó el integrante
    const premioJefe = await premiar(delJefe[0]!, 'pz50') // lo pagó el jefe
    // Lo que pasó de verdad y NADIE registró antes de desactivarlo: el integrante
    // le entregó 300.000 y pagó su premio; el jefe entregó 400.000 al dueño y
    // pagó el suyo.
    await desactivar('ra')

    // Él ya no puede registrar nada.
    const elJefe = await sesion('ra')
    expect(
      (await entregar(elJefe, RZ, 'rm', 300_000, { fecha: '2026-08-20' })).error?.message,
    ).toBe('No encontramos esa cuenta. Vuelve a abrir el cierre de cuentas.')
    expect(
      (await pagarPremio(elJefe, RZ, premioIntegrante, 'rm', { fecha: premioIntegrante.fecha }))
        .error?.message,
    ).toBe('No encontramos ese premio en esta rifa.')
    // Y el personal NO puede hacerlo por él: no se amplía ningún permiso.
    expect((await entregar(dueno, RZ, 'rm', 300_000, { fecha: '2026-08-20' })).error?.message).toBe(
      'Lo que entrega Integrante Del Que Se Va lo confirma su vendedor a cargo, Jefe Que Se Va.',
    )
    expect(
      (await pagarPremio(dueno, RZ, premioIntegrante, 'rm', { fecha: premioIntegrante.fecha }))
        .error?.message,
    ).toBe('Lo que pagó Integrante Del Que Se Va lo registra su vendedor a cargo, Jefe Que Se Va.')
    // Lo que recibió el dueño y el premio que pagó el propio jefe sí se registran.
    exito(await entregar(dueno, RZ, 'ra', 400_000, { fecha: '2026-08-28' }))
    exito(await pagarPremio(dueno, RZ, premioJefe, 'ra', { fecha: premioJefe.fecha }))

    // La cuenta con el dueño no se da por buena: el premio sin registrar la deja
    // en «Falta información». 840.000 − 210.000 − 50.000 − 400.000 = 180.000
    // (la verdad son 160.000: el integrante pagó 20.000 de premio).
    expect(await cuenta(RZ, 'ra', null)).toMatchObject({
      balance: 180_000,
      status: 'missing_info',
    })
    // Y la del integrante sigue pidiéndole los 300.000 que ya entregó.
    expect((await cuenta(RZ, 'rm', 'ra')).balance).toBe(500_000)

    // REORGANIZAR SIN REGISTRAR ANTES: el integrante pasa al jefe nuevo.
    await cambiarDeEquipo('rm', 'rn')
    // Ahora su entrega solo se puede confirmar como recibida por el jefe NUEVO,
    // que nunca la recibió.
    const falsa = exito(
      await entregar(await sesion('rn'), RZ, 'rm', 300_000, { fecha: '2026-08-20' }),
    )
    const [registrada] = await transferencias(RZ, 'rm')
    expect(registrada).toMatchObject({ counterpart_id: id('rn'), confirmed_by: id('rn') })
    // Y las cuentas mienten: el que se fue aparece con dinero A SU FAVOR, aunque
    // tiene los 300.000 del integrante; el nuevo debe dinero que nunca tuvo.
    const seFue = await cuenta(RZ, 'ra', null)
    const llega = await cuenta(RZ, 'rn', null)
    expect(seFue).toMatchObject({ balance: -270_000, status: 'in_favor' })
    expect(llega.balance).toBe(450_000)
    // Se deshace la prueba de la atribución falsa, con su motivo.
    exito(
      await (
        await sesion('rn')
      ).rpc('settlement_void_transfer', {
        p_transfer_id: falsa[0]!.transfer_id,
        p_reason: 'La recibió el jefe anterior, no yo',
      }),
    )
  }, 180_000)

  it('Z12-02: lo correcto es registrar antes —reactivándolo un momento— y reorganizar después', async () => {
    await altaDirecta('sa', 'Jefe Reactivado', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await altaDirecta('sn', 'Jefe Siguiente', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await altaIntegrante('sm', 'Integrante Del Reactivado', 'sa', {
      model: 'fixed_per_ticket',
      amount: 20_000,
    })
    const delIntegrante = await vender('sm', RZ, 5)
    const delJefe = await vender('sa', RZ, 2)
    await cobrar('sm', delIntegrante)
    await cobrar('sa', delJefe)
    const premioIntegrante = await premiar(delIntegrante[0]!, 'pz30')
    const premioJefe = await premiar(delJefe[0]!, 'pz80')
    await desactivar('sa')

    // El personal lo reactiva para que ÉL registre lo que recibió; después lo desactiva.
    await desactivar('sa', true)
    const elJefe = await sesion('sa')
    exito(await pagarPremio(elJefe, RZ, premioIntegrante, 'sm', { fecha: premioIntegrante.fecha }))
    exito(await entregar(elJefe, RZ, 'sm', 300_000, { fecha: '2026-08-20' }))
    await desactivar('sa')
    exito(await entregar(dueno, RZ, 'sa', 400_000, { fecha: '2026-08-28' }))
    exito(await pagarPremio(dueno, RZ, premioJefe, 'sa', { fecha: premioJefe.fecha }))

    // Exacto: integrante 600.000 − 100.000 − 30.000 − 300.000 = 170.000;
    // jefe y equipo 840.000 − 210.000 − 110.000 − 400.000 = 120.000.
    expect((await cuenta(RZ, 'sm', 'sa')).balance).toBe(170_000)
    expect(await cuenta(RZ, 'sa', null)).toMatchObject({ balance: 120_000, status: 'partial' })
    expect(await transferencias(RZ, 'sm')).toEqual([
      expect.objectContaining({ counterpart_id: id('sa'), confirmed_by: id('sa') }),
    ])

    // Reorganizar DESPUÉS conserva quién recibió (Z8): el anterior se queda con
    // lo que recibió del integrante; el nuevo responde por lo que falta.
    await cambiarDeEquipo('sm', 'sn')
    const anterior = await cuenta(RZ, 'sa', null)
    const nuevo = await cuenta(RZ, 'sn', null)
    // El anterior: 240.000 − 60.000 − 80.000 − 400.000 + 300.000 recibidos = 0.
    expect(anterior.balance).toBe(0)
    // El nuevo: su equipo le debe 170.000 y gana 50.000 por esas ventas: 120.000.
    expect(nuevo.balance).toBe(120_000)
    expect((await cuenta(RZ, 'sm', 'sn')).balance).toBe(170_000)
    // El dinero se conserva: 0 + 120.000 = los 120.000 de antes de reorganizar.
    expect(anterior.balance + nuevo.balance).toBe(120_000)
  }, 180_000)

  it('Z12-03: lo que PAGÓ el vendedor a cargo —registrado antes de reorganizar, se queda con él; sin registrar, ya no se le puede atribuir—', async () => {
    await altaDirecta('xa', 'Jefe Que Pagó', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await altaDirecta('xn', 'Jefe Que Recibe El Equipo', {
      mode: 'fixed_per_ticket',
      fixed: 30_000,
    })
    await altaIntegrante('xm', 'Integrante Con Premios', 'xa', {
      model: 'fixed_per_ticket',
      amount: 20_000,
    })
    const delIntegrante = await vender('xm', RZ, 4)
    const delJefe = await vender('xa', RZ, 1)
    await cobrar('xm', delIntegrante)
    await cobrar('xa', delJefe)
    // Dos premios de boletas del integrante que el vendedor a cargo pagó de su
    // bolsillo; ninguno registrado cuando se le desactiva.
    const registrado = await premiar(delIntegrante[0]!, 'pz20')
    const sinRegistrar = await premiar(delIntegrante[1]!, 'pz30')
    await desactivar('xa')

    // Lo que pagó el vendedor a cargo lo registra el personal —quien recibe sus
    // entregas—, también con él desactivado: la regla de siempre (BR-Z07), no un
    // permiso nuevo.
    exito(await pagarPremio(dueno, RZ, registrado, 'xa', { fecha: registrado.fecha }))
    // 600.000 − (30.000 + 40.000 + 80.000) − 20.000 = 430.000, y «Falta
    // información» por el otro premio.
    expect(await cuenta(RZ, 'xa', null)).toMatchObject({
      balance: 430_000,
      prizes_paid: 20_000,
      status: 'missing_info',
    })

    // Se reorganiza sin registrar el segundo.
    await cambiarDeEquipo('xm', 'xn')
    // El registrado conserva a quien lo pagó y sigue en su cuenta: 120.000 −
    // 30.000 − 20.000 = 70.000.
    const { rows: pagos } = await db.query(
      `select payer_id from settlement_prize_payments where match_id = $1 and voided_at is null`,
      [registrado.matchId],
    )
    expect(pagos).toEqual([{ payer_id: id('xa') }])
    expect(await cuenta(RZ, 'xa', null)).toMatchObject({ balance: 70_000, prizes_paid: 20_000 })
    // El nuevo responde por el equipo —480.000 − 80.000 − 40.000 = 360.000— y el
    // premio sin registrar le queda a él como «Falta información», aunque no lo pagó.
    expect(await cuenta(RZ, 'xn', null)).toMatchObject({ balance: 360_000, status: 'missing_info' })
    // Y ya no se puede atribuir a quien de verdad lo pagó: solo a otro.
    expect(
      (await pagarPremio(dueno, RZ, sinRegistrar, 'xa', { fecha: sinRegistrar.fecha })).error
        ?.message,
    ).toBe(
      'Este premio lo pudo pagar Integrante Con Premios, su vendedor a cargo Jefe Que Recibe El Equipo o el dueño.',
    )
  }, 180_000)
})

describe('Z13 — un premio de un sorteo anterior al historial no existe para la cuenta (I-194)', () => {
  let RH: string

  beforeAll(async () => {
    RH = await rifaConPremios('Rifa premio anterior', 'ph')
  }, 60_000)

  it('Z13-01: no aparece, no se puede registrar y la cuenta se cierra sin saberlo', async () => {
    await altaDirecta('pp', 'Vendedor Del Premio Viejo', {
      mode: 'fixed_per_ticket',
      fixed: 25_000,
    })
    const vendidas = await vender('pp', RH, 3)
    await cobrar('pp', vendidas)
    // Un premio de un sorteo del 3 de agosto: antes del 9, inicio del historial.
    const viejo = await premiar(vendidas[0]!, 'ph50', { fecha: '2026-08-03' })
    expect(viejo.fecha).toBe('2026-08-03')

    // 360.000 − 75.000 = 285.000, y ningún premio: la cuenta no sabe de él.
    expect(await cuenta(RH, 'pp', null)).toMatchObject({
      balance: 285_000,
      awards: 0,
      status: 'pending',
    })
    expect((await pagarPremio(dueno, RH, viejo, 'pp', { fecha: viejo.fecha })).error?.message).toBe(
      'No encontramos ese premio en esta rifa.',
    )

    // Si el vendedor lo pagó de lo cobrado y entregó el resto (235.000), la cuenta
    // le pide los 50.000 que ya salieron en el premio...
    exito(await entregar(dueno, RH, 'pp', 235_000, { fecha: '2026-08-25' }))
    expect((await cuenta(RH, 'pp', null)).balance).toBe(50_000)
    // ...y si los vuelve a poner, la cuenta queda «Cerrada» como definitiva.
    exito(await entregar(dueno, RH, 'pp', 50_000))
    expect((await cuenta(RH, 'pp', null)).status).toBe('closed')
  }, 120_000)
})
