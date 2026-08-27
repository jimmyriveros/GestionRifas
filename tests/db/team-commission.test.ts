/**
 * El reparto del equipo (migracion 0031, BR-G20..BR-G26, D-127).
 *
 * DOS REGLAS SE PRUEBAN AQUI, Y LA SEGUNDA SOLO EXISTE POR LA PRIMERA:
 *
 *   1. Cada boleta cobrada deja a la empresa la MITAD de su precio, la venda
 *      quien la venda. La otra mitad es el bolsillo del vendedor, y cuando la
 *      vende un integrante se REPARTE: el integrante toma su tarifa y su
 *      vendedor padre se queda con el resto.
 *
 *   2. El padre elige COMO se le paga a cada integrante: por tramos (lo de
 *      siempre) o una cifra fija por boleta. Como esa cifra sale de su propio
 *      bolsillo, no puede pasar de la mitad del precio.
 *
 * NINGUNA CIFRA DE PRECIO SE ESCRIBE A MANO (D-098): el precio sale de la rifa.
 * Los tramos SI se escriben, porque son la tabla que se esta comprobando.
 *
 * PORQUE HAY UNA RIFA PROPIA. Estas pruebas cambian el precio de la rifa y la
 * configuracion de pago de un vendedor, y las dos cosas recalculan dinero hacia
 * atras (BR-G15, BR-G25). Hacerlo sobre la rifa del seed le movería las cifras a
 * las demas suites segun el orden de ejecucion, que es la trampa de I-035.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DB_URL, loadSeedContext, SEED_PASSWORD, signInAs, type Client } from './helpers'

let db: PgClient
let ctx: Awaited<ReturnType<typeof loadSeedContext>>

/** Precio oficial de la rifa de esta suite. Se lee, no se escribe. */
let PRECIO: number
/** La mitad: el bolsillo del vendedor por boleta, y el tope del valor fijo. */
let MITAD: number

let rifaId: string

/** Vendedor padre: sin `parent_seller_id`, con equipo. */
let padreId: string
let padre: Client
/** Integrante por tramos (el default). */
let hijoId: string
let hijo: Client
/** Segundo integrante, para probar el valor fijo sin tocar al primero. */
let hijo2Id: string
let hijo2: Client
/** Vendedor sin equipo ni padre: el control de que nada de esto le afecta. */
let sueltoId: string

const clientes = new Map<string, string>()
const numerosUsados = new Set<string>()
const creados: string[] = []

async function numeroLibre(): Promise<string> {
  for (let n = 1000; n < 10000; n++) {
    const numero = String(n)
    if (numerosUsados.has(numero)) continue
    const { rows } = await db.query(
      `select 1 from tickets
        where raffle_id = $1 and daily_number = $2 and weekly_number = $2 limit 1`,
      [rifaId, numero],
    )
    if (rows.length === 0) {
      numerosUsados.add(numero)
      return numero
    }
  }
  throw new Error('No queda ninguna combinacion libre en la rifa de la suite.')
}

/**
 * Alta idempotente, por el mismo motivo que en `sale-discount`: estos vendedores
 * venden con su propia sesion y quedan como ACTORES en `audit_logs`, que es de
 * solo anexado (BR-D02). La cuenta de Auth no se puede borrar; la MEMBRESIA si,
 * y sin ella la persona desaparece de la organizacion.
 */
async function altaVendedor(nombre: string, padreDe: string | null): Promise<string> {
  const email = `${nombre}-equipo@demo.test`

  const { data: existente } = await ctx.svc
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  let profileId = existente?.id ?? null

  if (profileId === null) {
    const { data, error } = await ctx.svc.auth.admin.createUser({
      email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `${nombre} Equipo`, phone: '3001234567' },
    })
    if (error) throw new Error(`No se pudo crear ${nombre}: ${error.message}`)
    profileId = data.user.id
  }

  // I-007: `createUser` no deja la contrasena utilizable por si sola.
  await ctx.svc.auth.admin.updateUserById(profileId, { password: SEED_PASSWORD })

  const { error: membresiaError } = await ctx.svc.from('memberships').insert({
    organization_id: ctx.demoOrg.id,
    profile_id: profileId,
    role: 'seller',
    parent_seller_id: padreDe,
  })
  if (membresiaError) throw membresiaError

  const { data: cliente, error: clienteError } = await ctx.svc
    .from('clients')
    .insert({
      organization_id: ctx.demoOrg.id,
      seller_id: profileId,
      name: `Cliente de ${nombre}`,
      phone: '3009996655',
    })
    .select('id')
    .single()
  if (clienteError) throw clienteError

  clientes.set(profileId, cliente.id)
  creados.push(profileId)
  return profileId
}

/** Vende `n` boletas de `sellerId` al precio indicado y las cobra ENTERAS. */
async function venderYCobrar(
  sesion: Client,
  sellerId: string,
  n: number,
  precio?: number,
): Promise<void> {
  const clienteId = clientes.get(sellerId)!

  for (let i = 0; i < n; i++) {
    const numero = await numeroLibre()
    const { data, error } = await ctx.svc
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: rifaId,
        seller_id: sellerId,
        created_by: ctx.ids.owner,
        daily_number: numero,
        weekly_number: numero,
        inventory_status: 'available',
      })
      .select('id')
      .single()
    if (error) throw error

    const { error: ventaError } = await sesion.rpc('bulk_assign_tickets', {
      p_ticket_ids: [data.id],
      p_client_id: clienteId,
      p_sale_price: precio,
    })
    if (ventaError) throw new Error(`No se pudo vender: ${ventaError.message}`)

    const { data: fila } = await ctx.svc
      .from('tickets')
      .select('sale_price')
      .eq('id', data.id)
      .single()

    const { error: pagoError } = await sesion.rpc('create_payment', {
      p_client_id: clienteId,
      p_total_amount: fila!.sale_price!,
      p_allocations: [{ ticket_id: data.id, amount: fila!.sale_price! }],
    })
    if (pagoError) throw new Error(`No se pudo cobrar: ${pagoError.message}`)
  }
}

type Comision = {
  n: number
  rate: number
  earned: number
  teamN: number
  teamEarned: number
}

async function comision(sellerId: string): Promise<Comision> {
  const { rows } = await db.query(
    `select tickets_paid, rate, earned, team_tickets_paid, team_earned
       from seller_commissions where raffle_id = $1 and seller_id = $2`,
    [rifaId, sellerId],
  )
  const f = rows[0] ?? {
    tickets_paid: 0,
    rate: 0,
    earned: 0,
    team_tickets_paid: 0,
    team_earned: 0,
  }
  return {
    n: f.tickets_paid,
    rate: Number(f.rate),
    earned: Number(f.earned),
    teamN: f.team_tickets_paid,
    teamEarned: Number(f.team_earned),
  }
}

/**
 * La invariante de BR-G10, ahora en dos mitades (BR-G22).
 *
 * Comprobarlas por separado es mas fuerte que comprobar el total: un error que
 * se compensara entre lo propio y lo del equipo pasaria desapercibido sumando.
 */
async function expectLedgerCuadra(sellerId: string): Promise<void> {
  const { rows } = await db.query(
    `select
       coalesce(sum(amount) filter (where not team_movement), 0)::bigint as propio,
       coalesce(sum(amount) filter (where team_movement), 0)::bigint     as equipo
     from commission_ledger where raffle_id = $1 and seller_id = $2`,
    [rifaId, sellerId],
  )
  const c = await comision(sellerId)
  expect(Number(rows[0].propio), 'el ledger propio explica `earned`').toBe(c.earned)
  expect(Number(rows[0].equipo), 'el ledger de equipo explica `team_earned`').toBe(c.teamEarned)
}

/** Lo que la empresa se queda de verdad: cobrado menos TODAS las comisiones. */
async function participacionEmpresa(): Promise<number> {
  const { rows } = await db.query(
    `select
       (select coalesce(sum(t.sale_price), 0) from tickets t
         where t.raffle_id = $1
           and t.inventory_status = 'assigned' and t.payment_status = 'paid')
     - (select coalesce(sum(sc.earned + sc.team_earned), 0)
          from seller_commissions sc where sc.raffle_id = $1)
       as resto`,
    [rifaId],
  )
  return Number(rows[0].resto)
}

async function setModelo(
  memberId: string,
  modelo: 'tiered' | 'fixed_per_ticket',
  monto: number | null,
): Promise<void> {
  await ctx.svc
    .from('memberships')
    .update({ commission_model: modelo, fixed_commission_amount: monto })
    .eq('profile_id', memberId)
    .eq('organization_id', ctx.demoOrg.id)
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  const { data: rifa, error: rifaError } = await ctx.svc
    .from('raffles')
    .insert({
      organization_id: ctx.demoOrg.id,
      name: 'Rifa Equipo (pruebas)',
      short_code: `EQ${Date.now().toString(36).slice(-4).toUpperCase()}`,
      ticket_price: 120_000,
      start_date: '2026-08-01',
      end_date: '2026-12-31',
      status: 'active',
      created_by: ctx.ids.owner,
    })
    .select('id, ticket_price')
    .single()
  if (rifaError) throw rifaError

  rifaId = rifa.id
  PRECIO = Number(rifa.ticket_price)
  MITAD = Math.floor(PRECIO / 2)

  padreId = await altaVendedor('padre', null)
  hijoId = await altaVendedor('hijo', padreId)
  hijo2Id = await altaVendedor('hijodos', padreId)
  sueltoId = await altaVendedor('sueltoeq', null)

  padre = await signInAs('padre-equipo@demo.test')
  hijo = await signInAs('hijo-equipo@demo.test')
  hijo2 = await signInAs('hijodos-equipo@demo.test')
}, 120_000)

/**
 * TODO en UNA transaccion, y no por elegancia.
 *
 * `payments_balance_check` (0004) es un CONSTRAINT TRIGGER DEFERRABLE INITIALLY
 * DEFERRED: comprueba al CONFIRMAR que la suma de las asignaciones es igual al
 * total del pago. Con una sentencia por transaccion, borrar las asignaciones
 * confirma un pago de $120.000 con $0 repartidos y el trigger lo rechaza —que es
 * exactamente su trabajo—. Dentro de una sola transaccion, al confirmar ya no
 * queda ni el pago ni la asignacion y no hay nada que cuadrar.
 *
 * EL ORDEN IMPORTA, y por dos motivos distintos:
 *
 *   * Las tablas de comision se vacian DESPUES de las boletas, nunca antes:
 *     borrar una boleta dispara `tickets_sync_commission`, que vuelve a crear la
 *     fila de `seller_commissions` que se acabara de borrar. Hecho al reves, el
 *     `delete from raffles` de despues choca contra
 *     `seller_commissions_raffle_org_fk`.
 *   * Los integrantes antes que su vendedor padre, porque
 *     `memberships_parent_seller_fk` es `on delete restrict`.
 */
afterAll(async () => {
  await db.query('begin')
  try {
    await db.query(
      `delete from payment_allocations where ticket_id in
         (select id from tickets where raffle_id = $1)`,
      [rifaId],
    )
    await db.query(`delete from payments where seller_id = any($1::uuid[])`, [creados])
    await db.query(`delete from notifications where recipient_profile_id = any($1::uuid[])`, [
      creados,
    ])
    await db.query(`delete from tickets where raffle_id = $1`, [rifaId])
    await db.query(`delete from commission_ledger where raffle_id = $1`, [rifaId])
    await db.query(`delete from seller_commissions where raffle_id = $1`, [rifaId])
    await db.query(`delete from raffles where id = $1`, [rifaId])
    await db.query(`delete from clients where seller_id = any($1::uuid[])`, [creados])
    await db.query(
      `delete from memberships
        where parent_seller_id is not null and profile_id = any($1::uuid[])`,
      [creados],
    )
    await db.query(`delete from memberships where profile_id = any($1::uuid[])`, [creados])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  }
  await db.end()
}, 120_000)

describe('E10 — el equipo reparte una sola mitad', () => {
  it('E10-01: el integrante cobra su tramo y el padre se queda con el resto', async () => {
    await venderYCobrar(hijo, hijoId, 1)

    const h = await comision(hijoId)
    expect(h.n).toBe(1)
    expect(h.rate).toBe(20_000)
    expect(h.earned).toBe(20_000)
    // El integrante no tiene equipo propio (BR-E03, dos niveles).
    expect(h.teamEarned).toBe(0)

    const p = await comision(padreId)
    expect(p.teamN).toBe(1)
    expect(p.teamEarned).toBe(MITAD - 20_000)
    // Y no ha vendido nada el mismo: su comision propia sigue en cero.
    expect(p.n).toBe(0)
    expect(p.earned).toBe(0)

    await expectLedgerCuadra(hijoId)
    await expectLedgerCuadra(padreId)
  })

  it('E10-02: el padre cobra la mitad por lo suyo, y se suma a lo del equipo', async () => {
    await venderYCobrar(padre, padreId, 2)

    const p = await comision(padreId)
    expect(p.n).toBe(2)
    expect(p.rate).toBe(MITAD)
    expect(p.earned).toBe(2 * MITAD)
    // Lo del equipo no se toca al vender el padre: son dos bloques separados.
    expect(p.teamEarned).toBe(MITAD - 20_000)

    await expectLedgerCuadra(padreId)
  })

  it('E10-03: un vendedor sin equipo no se entera de nada de esto', async () => {
    const suelto = await signInAs('sueltoeq-equipo@demo.test')
    await venderYCobrar(suelto, sueltoId, 1)

    const s = await comision(sueltoId)
    expect(s.rate).toBe(MITAD)
    expect(s.earned).toBe(MITAD)
    expect(s.teamN).toBe(0)
    expect(s.teamEarned).toBe(0)

    await expectLedgerCuadra(sueltoId)
  })

  it('E10-04: subir de tramo le sube al hijo y le BAJA al padre, retroactivo', async () => {
    // Hasta la boleta 20 el tramo es $20.000; en la 21 pasa a $25.000 y se
    // aplica a las 21 (BR-G02). El padre recibe `mitad − tarifa` por cada una,
    // asi que su parte baja de $40.000 a $35.000 en las 21 a la vez.
    await venderYCobrar(hijo, hijoId, 19) // van 20
    let h = await comision(hijoId)
    expect(h.n).toBe(20)
    expect(h.rate).toBe(20_000)
    expect(h.earned).toBe(20 * 20_000)
    expect((await comision(padreId)).teamEarned).toBe(20 * (MITAD - 20_000))

    await venderYCobrar(hijo, hijoId, 1) // 21
    h = await comision(hijoId)
    expect(h.n).toBe(21)
    expect(h.rate).toBe(25_000)
    expect(h.earned).toBe(21 * 25_000)

    const p = await comision(padreId)
    expect(p.teamN).toBe(21)
    expect(p.teamEarned).toBe(21 * (MITAD - 25_000))

    await expectLedgerCuadra(hijoId)
    await expectLedgerCuadra(padreId)
  })

  it('E10-05: anular el pago se lo quita a los dos', async () => {
    const { rows } = await db.query(
      `select p.id from payments p
         join payment_allocations pa on pa.payment_id = p.id
         join tickets t on t.id = pa.ticket_id
        where t.raffle_id = $1 and t.seller_id = $2 and p.voided_at is null
        limit 1`,
      [rifaId, hijoId],
    )

    const owner = await signInAs('owner@demo.test')
    const { error } = await owner.rpc('void_payment', {
      p_payment_id: rows[0].id,
      p_reason: 'Prueba de anulacion del reparto de equipo',
    })
    expect(error).toBeNull()

    // Vuelve a 20 boletas: el hijo baja de tramo y el padre sube de parte.
    const h = await comision(hijoId)
    expect(h.n).toBe(20)
    expect(h.rate).toBe(20_000)
    expect(h.earned).toBe(20 * 20_000)

    const p = await comision(padreId)
    expect(p.teamN).toBe(20)
    expect(p.teamEarned).toBe(20 * (MITAD - 20_000))

    await expectLedgerCuadra(hijoId)
    await expectLedgerCuadra(padreId)
  })

  it('E10-06: la empresa se queda EXACTAMENTE la mitad de cada boleta cobrada', async () => {
    // La regla que ordena todo lo demas (BR-G21). No depende de quien vendio,
    // ni del tramo, ni del reparto interno del equipo.
    const { rows } = await db.query(
      `select count(*)::int as n from tickets
        where raffle_id = $1 and inventory_status = 'assigned' and payment_status = 'paid'`,
      [rifaId],
    )
    expect(await participacionEmpresa()).toBe(rows[0].n * (PRECIO - MITAD))
  })

  it('E10-07: la rebaja del hijo la asume el hijo, no su padre', async () => {
    const antes = await comision(padreId)

    await venderYCobrar(hijo, hijoId, 1, PRECIO - 10_000)

    const h = await comision(hijoId)
    // 21 boletas a $25.000 menos los $10.000 rebajados (BR-G17).
    expect(h.n).toBe(21)
    expect(h.earned).toBe(21 * 25_000 - 10_000)

    const p = await comision(padreId)
    // El padre recibe `mitad − tarifa` por las 21, sin rastro de la rebaja.
    expect(p.teamEarned).toBe(21 * (MITAD - 25_000))
    // Y BAJA respecto a antes, que es lo contrario de lo que uno esperaria de
    // una venta mas: esa boleta devolvio al integrante al tramo de $25.000, y
    // el tramo es retroactivo (BR-G02), asi que el padre pasa a poner $35.000
    // de su bolsillo en las 21 en vez de $40.000 en 20. El sistema de tramos
    // se lo cobra a el, que es justo lo que significa BR-G20.
    expect(p.teamEarned).toBeLessThan(antes.teamEarned)

    await expectLedgerCuadra(hijoId)
    await expectLedgerCuadra(padreId)
  })
})

describe('E10 — valor fijo por boleta', () => {
  it('E10-08: el default de un integrante nuevo es `tiered` (compatibilidad)', async () => {
    const { rows } = await db.query(
      `select commission_model, fixed_commission_amount from memberships
        where profile_id = $1`,
      [hijo2Id],
    )
    expect(rows[0].commission_model).toBe('tiered')
    expect(rows[0].fixed_commission_amount).toBeNull()
  })

  it('E10-09: con valor fijo, cada boleta vale lo mismo sin importar cuantas', async () => {
    await setModelo(hijo2Id, 'fixed_per_ticket', 30_000)
    await venderYCobrar(hijo2, hijo2Id, 3)

    const h = await comision(hijo2Id)
    expect(h.n).toBe(3)
    expect(h.rate).toBe(30_000)
    expect(h.earned).toBe(3 * 30_000)

    await expectLedgerCuadra(hijo2Id)
  })

  it('E10-10: `commission_summary` no le habla de niveles a quien no los tiene', async () => {
    // Con la SESION del padre: la funcion es `security invoker` y hereda la RLS
    // de `seller_commissions`, asi que esto es lo que ve una persona de verdad.
    const { data, error } = await padre.rpc('commission_summary', { p_raffle_id: rifaId })
    expect(error).toBeNull()

    const fijo = data?.find((f) => f.seller_id === hijo2Id)
    expect(fijo!.pay_model).toBe('fixed')
    expect(fijo!.by_tiers).toBe(false)
    expect(fijo!.next_min_tickets).toBeNull()
    expect(fijo!.tickets_to_next).toBeNull()

    const tramos = data?.find((f) => f.seller_id === hijoId)
    expect(tramos!.pay_model).toBe('tiered')
    expect(tramos!.by_tiers).toBe(true)
    expect(tramos!.next_min_tickets).toBe(31)

    const jefe = data?.find((f) => f.seller_id === padreId)
    expect(jefe!.pay_model).toBe('half_price')
    expect(jefe!.by_tiers).toBe(false)
    expect(Number(jefe!.team_earned)).toBeGreaterThan(0)
  })

  it('E10-11: cambiar el valor fijo recalcula hacia atras, sin esperar otra venta', async () => {
    const antesPadre = await comision(padreId)

    await setModelo(hijo2Id, 'fixed_per_ticket', 45_000)

    const h = await comision(hijo2Id)
    expect(h.rate).toBe(45_000)
    expect(h.earned).toBe(3 * 45_000)

    // Y le sale del bolsillo al padre: paga $15.000 mas por cada una de las 3.
    const p = await comision(padreId)
    expect(p.teamEarned).toBe(antesPadre.teamEarned - 3 * 15_000)

    await expectLedgerCuadra(hijo2Id)
    await expectLedgerCuadra(padreId)
  })

  it('E10-12: de fijo a tramos recalcula por tramos, con su recuento real', async () => {
    await setModelo(hijo2Id, 'tiered', null)

    const h = await comision(hijo2Id)
    expect(h.rate).toBe(20_000) // 3 boletas: primer tramo
    expect(h.earned).toBe(3 * 20_000)

    await expectLedgerCuadra(hijo2Id)
  })

  it('E10-13: de tramos a fijo recalcula por el valor fijo', async () => {
    await setModelo(hijo2Id, 'fixed_per_ticket', 50_000)

    const h = await comision(hijo2Id)
    expect(h.rate).toBe(50_000)
    expect(h.earned).toBe(3 * 50_000)

    await expectLedgerCuadra(hijo2Id)
  })

  it('E10-14: el valor fijo no puede pasar de la mitad del precio', async () => {
    const { error } = await ctx.svc
      .from('memberships')
      .update({ commission_model: 'fixed_per_ticket', fixed_commission_amount: MITAD + 1 })
      .eq('profile_id', hijo2Id)
      .eq('organization_id', ctx.demoOrg.id)

    expect(error).not.toBeNull()
    expect(error!.message).toContain('No puedes pagarle más de')

    // Y el tope justo se acepta: ahi el padre cede su parte entera.
    await setModelo(hijo2Id, 'fixed_per_ticket', MITAD)
    const p = await comision(padreId)
    expect(p.teamEarned).toBe(21 * (MITAD - 25_000)) // solo lo del hijo por tramos
    await expectLedgerCuadra(padreId)

    await setModelo(hijo2Id, 'fixed_per_ticket', 30_000)
  })

  it('E10-15: `tiered` con importe y `fixed` sin importe son imposibles', async () => {
    const conImporte = await ctx.svc
      .from('memberships')
      .update({ commission_model: 'tiered', fixed_commission_amount: 30_000 })
      .eq('profile_id', hijo2Id)
      .eq('organization_id', ctx.demoOrg.id)
    expect(conImporte.error).not.toBeNull()

    const sinImporte = await ctx.svc
      .from('memberships')
      .update({ commission_model: 'fixed_per_ticket', fixed_commission_amount: null })
      .eq('profile_id', hijo2Id)
      .eq('organization_id', ctx.demoOrg.id)
    expect(sinImporte.error).not.toBeNull()
  })
})

describe('E10 — quien puede cambiar la configuracion', () => {
  it('E10-16: el vendedor padre puede, y queda en la bitacora', async () => {
    const { error } = await padre.rpc('team_set_commission_model', {
      p_member_id: hijo2Id,
      p_model: 'fixed_per_ticket',
      p_amount: 35_000,
    })
    expect(error).toBeNull()

    expect((await comision(hijo2Id)).rate).toBe(35_000)

    const { rows } = await db.query(
      `select new_values from audit_logs
        where action = 'user.commission_model' and entity_id = $1
        order by created_at desc limit 1`,
      [hijo2Id],
    )
    expect(rows[0].new_values.commission_model).toBe('fixed_per_ticket')
    expect(Number(rows[0].new_values.fixed_commission_amount)).toBe(35_000)
    expect(rows[0].new_values.changed_by).toBe(padreId)
  })

  it('E10-17: un vendedor NO puede tocar a alguien que no es de su equipo', async () => {
    const { error } = await hijo.rpc('team_set_commission_model', {
      p_member_id: hijo2Id,
      p_model: 'fixed_per_ticket',
      p_amount: 60_000,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('no es de tu equipo')

    // Y no cambio nada.
    expect((await comision(hijo2Id)).rate).toBe(35_000)
  })

  it('E10-18: tampoco puede tocarse a si mismo para subirse la tarifa', async () => {
    const { error } = await hijo.rpc('team_set_commission_model', {
      p_member_id: hijoId,
      p_model: 'fixed_per_ticket',
      p_amount: 60_000,
    })
    expect(error).not.toBeNull()
    expect((await comision(hijoId)).rate).toBe(25_000)
  })

  it('E10-19: el tope tambien se aplica por la RPC, no solo por el trigger', async () => {
    const { error } = await padre.rpc('team_set_commission_model', {
      p_member_id: hijo2Id,
      p_model: 'fixed_per_ticket',
      p_amount: MITAD + 50_000,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('No puedes pagarle más de')
    expect((await comision(hijo2Id)).rate).toBe(35_000)
  })

  it('E10-20: `fixed_per_ticket` sin importe se rechaza con un mensaje util', async () => {
    const { error } = await padre.rpc('team_set_commission_model', {
      p_member_id: hijo2Id,
      p_model: 'fixed_per_ticket',
      p_amount: undefined,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('Escribe cuánto ganará')
  })

  it('E10-21: volver a tramos no exige importe, y lo deja nulo', async () => {
    const { error } = await padre.rpc('team_set_commission_model', {
      p_member_id: hijo2Id,
      p_model: 'tiered',
      p_amount: undefined,
    })
    expect(error).toBeNull()

    const { rows } = await db.query(
      `select commission_model, fixed_commission_amount from memberships where profile_id = $1`,
      [hijo2Id],
    )
    expect(rows[0].commission_model).toBe('tiered')
    expect(rows[0].fixed_commission_amount).toBeNull()
  })
})

describe('E10 — entrar y salir del equipo', () => {
  it('E10-22: sacar a un integrante le deja de pagar al padre, retroactivo', async () => {
    const antes = await comision(padreId)
    expect(antes.teamN).toBeGreaterThan(0)

    await ctx.svc
      .from('memberships')
      .update({ parent_seller_id: null })
      .eq('profile_id', hijo2Id)
      .eq('organization_id', ctx.demoOrg.id)

    // El que sale pasa a cobrar la mitad del precio (BR-G13).
    const h = await comision(hijo2Id)
    expect(h.rate).toBe(MITAD)
    expect(h.earned).toBe(3 * MITAD)

    // Y su ex vendedor padre deja de cobrar por sus ventas, sin esperar nada.
    const p = await comision(padreId)
    expect(p.teamN).toBe(antes.teamN - 3)

    await expectLedgerCuadra(hijo2Id)
    await expectLedgerCuadra(padreId)
  })

  it('E10-23: volver a meterlo lo devuelve a su configuracion, y al padre su parte', async () => {
    await ctx.svc
      .from('memberships')
      .update({ parent_seller_id: padreId })
      .eq('profile_id', hijo2Id)
      .eq('organization_id', ctx.demoOrg.id)

    const h = await comision(hijo2Id)
    expect(h.rate).toBe(20_000) // volvio a tramos, 3 boletas
    expect((await comision(padreId)).teamN).toBe(24)

    await expectLedgerCuadra(padreId)
  })

  it('E10-24: cambiar el precio de la rifa recalcula el reparto entero', async () => {
    const subido = PRECIO + 40_000
    const nuevaMitad = Math.floor(subido / 2)

    await ctx.svc.from('raffles').update({ ticket_price: subido }).eq('id', rifaId)

    // Al padre le sube por sus ventas Y por las de su equipo.
    const p = await comision(padreId)
    expect(p.rate).toBe(nuevaMitad)
    expect(p.earned).toBe(2 * nuevaMitad)
    expect(p.teamEarned).toBe(21 * (nuevaMitad - 25_000) + 3 * (nuevaMitad - 20_000))

    // Y a los integrantes por tramos no les cambia nada: su tarifa no depende
    // del precio (BR-G15 solo alcanza a quien cobra la mitad).
    expect((await comision(hijoId)).rate).toBe(25_000)

    await expectLedgerCuadra(padreId)
    await expectLedgerCuadra(hijoId)

    await ctx.svc.from('raffles').update({ ticket_price: PRECIO }).eq('id', rifaId)
  })

  it('E10-25: recalcular a mano no duplica nada (idempotencia, BR-G08)', async () => {
    const antes = await comision(padreId)
    const { rows: antesLedger } = await db.query(
      `select count(*)::int as n from commission_ledger where raffle_id = $1`,
      [rifaId],
    )

    for (const id of [padreId, hijoId, hijo2Id, sueltoId]) {
      await db.query(`select recalc_seller_commission($1, $2, $3)`, [ctx.demoOrg.id, rifaId, id])
    }

    expect(await comision(padreId)).toEqual(antes)
    const { rows: despuesLedger } = await db.query(
      `select count(*)::int as n from commission_ledger where raffle_id = $1`,
      [rifaId],
    )
    expect(despuesLedger[0].n).toBe(antesLedger[0].n)
  })

  it('E10-26: la comision nunca queda en negativo, ni la del padre', async () => {
    const { rows } = await db.query(
      `select count(*)::int as n from seller_commissions
        where raffle_id = $1 and (earned < 0 or team_earned < 0)`,
      [rifaId],
    )
    expect(rows[0].n).toBe(0)
  })
})
