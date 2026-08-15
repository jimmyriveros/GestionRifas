/**
 * La corrección del precio de $100.000 a $120.000 (migración 0027, D-098).
 *
 * POR QUÉ ESTE ARCHIVO EJECUTA LA MIGRACIÓN DE VERDAD
 *
 * En una base recién creada, `db reset` aplica `0027` cuando todavía no hay ni
 * una fila: la parte estructural se prueba sola, pero la corrección de datos
 * —lo único que puede estropear dinero— no toca nada y no demuestra nada.
 *
 * Así que estas pruebas montan el escenario que la migración se encontró en el
 * proyecto real, LEEN el bloque de corrección del propio archivo `.sql` y lo
 * ejecutan. No es una copia del SQL: si alguien cambia la migración, cambia lo
 * que se prueba aquí.
 *
 * Y SE EJECUTA DENTRO DE UNA TRANSACCIÓN QUE SE REVIERTE
 *
 * El criterio de la migración es `ticket_price = 100000` en toda la base, no
 * «las rifas de esta prueba». Otras suites crean rifas a ese precio (`rpc`,
 * `volume-phase6`), así que dejar la corrección confirmada las modificaría a su
 * espalda y provocaría fallos intermitentes en archivos que nadie tocó —la
 * misma familia de I-035, I-055 e I-057—. Con `begin … rollback` el escenario se
 * corrige, se comprueba entero y desaparece.
 *
 * Consecuencia práctica: todo lo que se lee DENTRO de la transacción se lee por
 * la misma conexión `pg`. El cliente de Supabase es otra conexión y no vería
 * nada de esto.
 *
 * LO QUE HAY QUE DEMOSTRAR
 *
 *   1. La boleta que tenía $100.000 pagados y figuraba PAGADA queda ABONADA con
 *      $20.000 pendientes. Es el caso que motivó todo.
 *   2. Ni un peso de `payments` ni de `payment_allocations` se mueve.
 *   3. Lo que no cumple el criterio no se toca: otra rifa, otro precio, rifa
 *      cerrada, boleta anulada, boleta sin vender.
 */
import { Client as PgClient } from 'pg'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DB_URL, loadSeedContext, signInAs, type Client } from './helpers'

const MIGRACION = join(process.cwd(), 'supabase', 'migrations', '0027_ticket_price_120000.sql')

const PRECIO_VIEJO = 100_000
const PRECIO_NUEVO = 120_000
/** Precio legítimo distinto: existe para comprobar que NO se toca. */
const PRECIO_ESPECIAL = 90_000

let db: PgClient
let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let seller: Client

let rifaAfectada: string
let rifaCerrada: string
let clienteId: string

/** Las boletas del escenario, por el papel que juegan. */
type Papel =
  | 'sinVender'
  | 'sinPagos'
  | 'parcial'
  | 'criticaPagada'
  | 'precioEspecial'
  | 'anulada'
  | 'deRifaCerrada'
const t = {} as Record<Papel, string>
/** Pagos creados, para limpiarlos al final. */
const pagos: string[] = []

/**
 * Extrae el bloque de corrección de datos del archivo de migración.
 *
 * Se salta a propósito los `alter table … set default`: el valor predeterminado
 * ya está aplicado en esta base y volver a ponerlo no prueba nada. Lo que se
 * ejecuta es el `do $$ … $$;`, que es donde se mueve el dinero.
 */
function bloqueDeCorreccion(): string {
  const sql = readFileSync(MIGRACION, 'utf8')
  const match = sql.match(/do \$\$[\s\S]*?\n\$\$;/)
  if (!match) throw new Error('No se encontró el bloque `do $$ … $$;` en 0027.')
  return match[0]
}

/** Crea una rifa propia de esta suite; ninguna prueba de dinero comparte rifa. */
async function crearRifa(nombre: string, precio: number, status: 'active' | 'closed') {
  const { data, error } = await ctx.svc
    .from('raffles')
    .insert({
      organization_id: ctx.demoOrg.id,
      name: `${nombre} ${Date.now().toString(36)}`,
      description: 'Escenario de la prueba de la corrección de precio (0027).',
      ticket_price: precio,
      start_date: '2026-08-01',
      end_date: '2026-12-31',
      status: 'draft',
      created_by: ctx.ids.owner,
    })
    .select('id')
    .single()
  if (error) throw error

  // BR-R03: los estados se recorren, no se saltan. A `closed` se llega por
  // `active`, nunca directamente desde borrador.
  const camino = status === 'closed' ? (['active', 'closed'] as const) : ([status] as const)
  for (const paso of camino) {
    const { error: pasoError } = await ctx.svc
      .from('raffles')
      .update({ status: paso })
      .eq('id', data.id)
    if (pasoError) throw pasoError
  }

  return data.id
}

/**
 * Inserta una boleta ya vendida. Se escribe con la clave de servicio y no por
 * `assign_ticket` porque hace falta un `sale_price` CONCRETO —incluido uno
 * distinto del precio de la rifa—, que es justo lo que la RPC no deja elegir.
 */
async function boletaVendida(raffleId: string, numero: string, salePrice: number) {
  const { data, error } = await ctx.svc
    .from('tickets')
    .insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: raffleId,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: numero,
      weekly_number: numero,
      inventory_status: 'assigned',
      client_id: clienteId,
      sale_price: salePrice,
      sale_date: '2026-08-15',
      assigned_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function boletaDisponible(raffleId: string, numero: string) {
  const { data, error } = await ctx.svc
    .from('tickets')
    .insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: raffleId,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: numero,
      weekly_number: numero,
      inventory_status: 'available',
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/** Cobra `monto` sobre una boleta con la sesión del vendedor, como la app. */
async function cobrar(ticketId: string, monto: number) {
  const { data, error } = await seller.rpc('create_payment', {
    p_client_id: clienteId,
    p_total_amount: monto,
    p_allocations: [{ ticket_id: ticketId, amount: monto }],
    p_payment_date: '2026-08-15',
    p_payment_method: 'cash',
  })
  if (error) throw new Error(`No se pudo cobrar: ${error.message}`)
  if (data) pagos.push(data)
}

// --- Lecturas por la conexión `pg`: son las únicas que ven la transacción ---

async function boleta(id: string) {
  const { rows } = await db.query(
    `select sale_price, paid_amount, payment_status, inventory_status
       from tickets where id = $1`,
    [id],
  )
  const fila = rows[0]
  return {
    salePrice: fila.sale_price === null ? null : Number(fila.sale_price),
    paidAmount: Number(fila.paid_amount),
    paymentStatus: fila.payment_status as string,
    inventoryStatus: fila.inventory_status as string,
    pendiente: fila.sale_price === null ? null : Number(fila.sale_price) - Number(fila.paid_amount),
  }
}

async function precioDeRifa(id: string) {
  const { rows } = await db.query(`select ticket_price from raffles where id = $1`, [id])
  return Number(rows[0].ticket_price)
}

/** Fotografía de TODO el dinero registrado, para comparar antes y después. */
async function fotoDeLosPagos() {
  const { rows } = await db.query(`
    select p.id, p.total_amount, p.voided_at,
           coalesce((select sum(a.amount) from payment_allocations a
                      where a.payment_id = p.id), 0) as asignado
      from payments p
     order by p.id
  `)
  return rows.map((r) => ({
    id: r.id as string,
    total: Number(r.total_amount),
    asignado: Number(r.asignado),
    anulado: r.voided_at !== null,
  }))
}

/** Un prefijo de dos cifras libre: los números se buscan, no se sortean (I-057). */
async function reservarBase(raffleId: string): Promise<number> {
  for (const candidato of Array.from({ length: 90 }, (_, i) => i + 10)) {
    const { error } = await ctx.svc.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: raffleId,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: `${candidato}99`,
      weekly_number: `${candidato}99`,
      inventory_status: 'available',
    })
    if (!error) return candidato
    if (error.code !== '23505') throw error
  }
  throw new Error('No quedaba ningún prefijo de dos cifras libre.')
}

beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  ctx = await loadSeedContext()
  seller = await signInAs('vendedor1@demo.test')

  rifaAfectada = await crearRifa('Rifa Precio 0027', PRECIO_VIEJO, 'active')
  rifaCerrada = await crearRifa('Rifa Cerrada 0027', PRECIO_VIEJO, 'closed')

  const { data: cliente, error: clienteError } = await ctx.svc
    .from('clients')
    .insert({
      organization_id: ctx.demoOrg.id,
      seller_id: ctx.ids.seller1,
      name: `Cliente 0027 ${Date.now().toString(36)}`,
      phone: '3009998877',
    })
    .select('id')
    .single()
  if (clienteError) throw clienteError
  clienteId = cliente.id

  const base = await reservarBase(rifaAfectada)
  const n = (i: number) => `${base}${String(i).padStart(2, '0')}`

  // --- El escenario, boleta a boleta -----------------------------------------
  t.sinVender = await boletaDisponible(rifaAfectada, n(1))
  t.sinPagos = await boletaVendida(rifaAfectada, n(2), PRECIO_VIEJO)
  t.parcial = await boletaVendida(rifaAfectada, n(3), PRECIO_VIEJO)
  t.criticaPagada = await boletaVendida(rifaAfectada, n(4), PRECIO_VIEJO)
  t.precioEspecial = await boletaVendida(rifaAfectada, n(5), PRECIO_ESPECIAL)
  t.anulada = await boletaVendida(rifaAfectada, n(6), PRECIO_VIEJO)
  t.deRifaCerrada = await boletaVendida(rifaCerrada, n(7), PRECIO_VIEJO)

  await cobrar(t.parcial, 50_000)
  await cobrar(t.criticaPagada, PRECIO_VIEJO)

  // La anulada se anula DESPUÉS de venderse, que es el único camino real.
  const { error: anularError } = await ctx.svc
    .from('tickets')
    .update({
      inventory_status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: 'Escenario de prueba 0027',
    })
    .eq('id', t.anulada)
  if (anularError) throw anularError
}, 90_000)

/**
 * La limpieza va por `pg` y en UNA transacción, no por PostgREST.
 *
 * Dos razones, las dos aprendidas fallando:
 *
 *   1. `payments_balanced` es un constraint trigger DIFERIDO: comprueba al hacer
 *      commit que la suma de las asignaciones cuadra con el total del pago.
 *      PostgREST envía cada `delete` en su propia transacción, así que borrar
 *      las asignaciones sueltas revienta con «El pago no cuadra: la suma de las
 *      asignaciones (0) debe ser igual al total». Y el cliente de Supabase
 *      devuelve el error en vez de lanzarlo, de modo que un `afterAll` que no lo
 *      mire deja TODO el escenario en la base **sin decir nada** — que es
 *      exactamente lo que pasó aquí: cuatro rifas y 28 boletas de más.
 *   2. Las comisiones se borran DESPUÉS de las boletas: `tickets_sync_commission`
 *      se dispara `after delete` y volvería a escribirlas.
 *
 * Cada sentencia comprueba su resultado; si algo queda a medias, se ve.
 */
afterAll(async () => {
  const rifas = [rifaAfectada, rifaCerrada]
  try {
    await db.query('begin')
    await db.query(
      `delete from payment_allocations
        where payment_id in (
          select id from payments where client_id = $1
        )`,
      [clienteId],
    )
    await db.query(`delete from payments where client_id = $1`, [clienteId])
    await db.query(
      `delete from notifications
        where entity_id in (select id from tickets where raffle_id = any($1::uuid[]))`,
      [rifas],
    )
    await db.query(`delete from tickets where raffle_id = any($1::uuid[])`, [rifas])
    await db.query(`delete from commission_ledger where raffle_id = any($1::uuid[])`, [rifas])
    await db.query(`delete from seller_commissions where raffle_id = any($1::uuid[])`, [rifas])
    await db.query(`delete from clients where id = $1`, [clienteId])
    await db.query(`delete from raffles where id = any($1::uuid[])`, [rifas])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  }

  const { rows } = await db.query(
    `select count(*)::int as n from raffles where id = any($1::uuid[])`,
    [rifas],
  )
  expect(rows[0].n, 'la suite debe dejar la base como la encontró').toBe(0)

  await db.end()
}, 60_000)

describe('E7 — antes de corregir', () => {
  it('E7-01: el valor predeterminado de la base de datos ya es $120.000', async () => {
    const { rows } = await db.query(`
      select table_name, column_default
        from information_schema.columns
       where table_schema = 'public'
         and (table_name, column_name) in
             (('raffles', 'ticket_price'), ('organizations', 'default_ticket_price'))
       order by table_name
    `)
    expect(rows.map((r) => r.column_default)).toEqual(['120000', '120000'])
  })

  it('E7-02: ninguna organización conserva $100.000 como precio base', async () => {
    const { rows } = await db.query(
      `select count(*)::int as n from organizations where default_ticket_price = 100000`,
    )
    expect(rows[0].n).toBe(0)
  })

  it('E7-03: el escenario parte del estado equivocado', async () => {
    expect(await precioDeRifa(rifaAfectada)).toBe(PRECIO_VIEJO)

    // La boleta del caso crítico figura PAGADA y sin saldo. Ese es el error.
    const critica = await boleta(t.criticaPagada)
    expect(critica.salePrice).toBe(PRECIO_VIEJO)
    expect(critica.paidAmount).toBe(PRECIO_VIEJO)
    expect(critica.paymentStatus).toBe('paid')
    expect(critica.pendiente).toBe(0)
  })
})

describe('E7 — con la corrección aplicada (transacción revertida)', () => {
  let pagosAntes: Awaited<ReturnType<typeof fotoDeLosPagos>>

  beforeAll(async () => {
    pagosAntes = await fotoDeLosPagos()
    await db.query('begin')
    await db.query(bloqueDeCorreccion())
  }, 60_000)

  afterAll(async () => {
    await db.query('rollback')
  })

  it('E7-04: la rifa afectada pasa a $120.000', async () => {
    expect(await precioDeRifa(rifaAfectada)).toBe(PRECIO_NUEVO)
  })

  it('E7-05: la boleta sin pagos sube de precio y sigue Sin pagar', async () => {
    const sinPagos = await boleta(t.sinPagos)
    expect(sinPagos.salePrice).toBe(PRECIO_NUEVO)
    expect(sinPagos.paidAmount).toBe(0)
    expect(sinPagos.paymentStatus).toBe('unpaid')
    expect(sinPagos.pendiente).toBe(PRECIO_NUEVO)
  })

  it('E7-06: el abono parcial no se mueve y el saldo crece', async () => {
    const parcial = await boleta(t.parcial)
    expect(parcial.salePrice).toBe(PRECIO_NUEVO)
    expect(parcial.paidAmount).toBe(50_000)
    expect(parcial.paymentStatus).toBe('partial')
    expect(parcial.pendiente).toBe(70_000)
  })

  it('E7-07: CASO CRÍTICO — $100.000 sobre $120.000 deja de estar Pagada', async () => {
    const critica = await boleta(t.criticaPagada)
    expect(critica.salePrice).toBe(PRECIO_NUEVO)
    // El pago histórico sigue siendo exactamente el que fue.
    expect(critica.paidAmount).toBe(PRECIO_VIEJO)
    expect(critica.paymentStatus).toBe('partial')
    expect(critica.pendiente).toBe(20_000)
  })

  it('E7-08: ni un peso de los movimientos históricos cambió', async () => {
    expect(await fotoDeLosPagos()).toEqual(pagosAntes)
  })

  it('E7-09: no se inventaron pagos ni asignaciones', async () => {
    const { rows } = await db.query(
      `select
         (select count(*)::int from payments where client_id = $1) as pagos,
         (select count(*)::int from payment_allocations a
             join payments p on p.id = a.payment_id
            where p.client_id = $1) as asignaciones`,
      [clienteId],
    )
    // Los dos cobros del escenario y ni uno más: la migración no crea dinero.
    expect(rows[0].pagos).toBe(2)
    expect(rows[0].asignaciones).toBe(2)
  })

  it('E7-10: lo que no cumple el criterio queda intacto', async () => {
    // Sin vender: sigue sin precio, y tomará los $120.000 al venderse (BR-P03).
    expect((await boleta(t.sinVender)).salePrice).toBeNull()

    // Precio legítimo distinto: nadie lo tocó.
    expect((await boleta(t.precioEspecial)).salePrice).toBe(PRECIO_ESPECIAL)

    // Anulada: conserva el precio con el que se anuló.
    const anulada = await boleta(t.anulada)
    expect(anulada.inventoryStatus).toBe('cancelled')
    expect(anulada.salePrice).toBe(PRECIO_VIEJO)

    // Rifa cerrada: es historia terminada y no se reescribe.
    expect(await precioDeRifa(rifaCerrada)).toBe(PRECIO_VIEJO)
    expect((await boleta(t.deRifaCerrada)).salePrice).toBe(PRECIO_VIEJO)
  })

  it('E7-11: la rifa de la otra organización no se roza', async () => {
    // «Rifa Control 2026» vale $50.000 por una razón legítima (aislamiento).
    expect(await precioDeRifa(ctx.controlRaffle.id)).toBe(50_000)
  })

  it('E7-12: la corrección quedó auditada boleta a boleta', async () => {
    const { rows } = await db.query(
      `select count(*)::int as n
         from audit_logs
        where entity_type = 'ticket'
          and action = 'ticket.update'
          and new_values ? 'sale_price'
          and (new_values ->> 'sale_price')::bigint = 120000
          and entity_id = any($1::uuid[])`,
      [[t.sinPagos, t.parcial, t.criticaPagada]],
    )
    expect(rows[0].n).toBe(3)
  })

  it('E7-13: el guardián del precio queda otra vez activo (BR-P05)', async () => {
    // La migración lo desactiva para su UPDATE y lo vuelve a dejar como estaba.
    const { rows } = await db.query(
      `select tgenabled from pg_trigger
        where tgname = 'tickets_protect_sale_price'
          and tgrelid = 'tickets'::regclass`,
    )
    expect(rows[0].tgenabled).toBe('O')

    // El UPDATE rechazado aborta la transacción, así que se acota con un
    // savepoint: la prueba siguiente sigue viendo el escenario corregido.
    await db.query('savepoint guardian')
    await expect(
      db.query(`update tickets set sale_price = 130000 where id = $1`, [t.criticaPagada]),
    ).rejects.toThrow(/pagos registrados/i)
    await db.query('rollback to savepoint guardian')
  })

  it('E7-14: volver a ejecutar la corrección no cambia nada (idempotente)', async () => {
    const antes = await boleta(t.criticaPagada)
    await db.query(bloqueDeCorreccion())

    expect(await boleta(t.criticaPagada)).toEqual(antes)
    expect(await precioDeRifa(rifaAfectada)).toBe(PRECIO_NUEVO)
    expect(await fotoDeLosPagos()).toEqual(pagosAntes)
  })
})
