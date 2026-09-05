/**
 * Entrega del paz y salvo (BR-I15, D-170).
 *
 * La RPC `set_ticket_clearance_delivery` enciende y apaga UN interruptor sobre
 * una boleta vendida. Aquí se comprueba que es del vendedor y de nadie más, que
 * la fecha sale del reloj del servidor, que no roza el dinero ni el estado de
 * la boleta, y que la base —no la interfaz— es la que devuelve el dato a
 * pendiente cuando la boleta cambia de cliente o vuelve al inventario.
 *
 * También se comprueba la CARGA INICIAL de la migración `0049`. En una base
 * local no deja rastro: `db:reset` aplica las migraciones y el seed vende sus
 * boletas DESPUÉS, así que el `UPDATE` de la migración encuentra cero filas.
 * Por eso la sentencia se lee del propio archivo de migración y se ejecuta
 * dentro de una transacción que se revierte: lo que se prueba es exactamente lo
 * que se va a aplicar en producción, no una copia que puede quedar desfasada.
 *
 * LIMPIEZA (I-059). Todo lo que crea esta suite se borra al final en UNA
 * transacción por `pg`: `payments_balanced` es un constraint trigger diferido y
 * borrar las asignaciones sueltas por PostgREST revienta sin decirlo.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  DB_URL,
  insertTicket,
  loadSeedContext,
  randomNumbers,
  signInAs,
  USERS,
  type Client,
} from './helpers'

let db: PgClient
let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let seller1: Client
let seller2: Client
let owner: Client
let admin: Client
let otherOrgSeller: Client

/** Clientes propios de la suite, para no mover los del seed. */
let clienteA: string
let clienteB: string
/** Uno en la cartera de `vendedor2`: BR-C05 no deja mezclarlas. */
let clienteDeSeller2: string

const ticketsCreados: string[] = []
const clientesCreados: string[] = []

async function crearCliente(sellerId: string, name: string, phone: string): Promise<string> {
  const { data, error } = await ctx.svc
    .from('clients')
    .insert({ organization_id: ctx.demoOrg.id, seller_id: sellerId, name, phone })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo crear el cliente ${name}: ${error.message}`)
  clientesCreados.push(data.id)
  return data.id
}

/**
 * Una boleta nueva en la rifa indicada.
 *
 * Los números se buscan LIBRES en vez de sortearse a ciegas: un choque con
 * `tickets_combo_unique` reventaría el escenario y arrastraría el archivo
 * entero, que es exactamente I-057.
 */
async function boletaDisponible(
  options: {
    sellerId?: string
    inventoryStatus?: 'available' | 'draft' | 'pending_approval'
  } = {},
): Promise<string> {
  const sellerId = options.sellerId ?? ctx.ids.seller1
  let ticketId: string | null = null
  for (let intento = 0; intento < 25 && ticketId === null; intento += 1) {
    const { daily, weekly } = randomNumbers()
    const created = await insertTicket(ctx.svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: sellerId,
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
      inventory_status: options.inventoryStatus ?? 'available',
    })
    if (created.error) {
      if (created.error.code === '23505') continue
      throw new Error(`No se pudo crear la boleta: ${created.error.message}`)
    }
    ticketId = created.data!.id
  }
  if (ticketId === null) throw new Error('No se encontró una combinación libre en 25 intentos')
  ticketsCreados.push(ticketId)
  return ticketId
}

/** Una boleta nueva, vendida a `clientId` por su vendedor. */
async function boletaVendida(clientId: string, sellerId = ctx.ids.seller1): Promise<string> {
  const ticketId = await boletaDisponible({ sellerId })
  const asSeller = sellerId === ctx.ids.seller2 ? seller2 : seller1
  const { error } = await asSeller.rpc('bulk_assign_tickets', {
    p_ticket_ids: [ticketId],
    p_client_id: clientId,
  })
  if (error) throw new Error(`No se pudo vender la boleta: ${error.message}`)
  return ticketId
}

async function abonar(clientId: string, ticketId: string, amount: number): Promise<string> {
  const { data, error } = await seller1.rpc('create_payment', {
    p_client_id: clientId,
    p_total_amount: amount,
    p_allocations: [{ ticket_id: ticketId, amount }],
  })
  if (error) throw new Error(`No se pudo registrar el abono: ${error.message}`)
  return data as string
}

async function estado(ticketId: string) {
  const { data, error } = await ctx.svc
    .from('tickets')
    .select(
      `client_id, seller_id, organization_id, raffle_id, daily_number, weekly_number,
       inventory_status, payment_status, sale_price, base_price, paid_amount, sale_date,
       assigned_at, internal_code, cancelled_at,
       clearance_receipt_delivered_at, clearance_receipt_assumed_delivered`,
    )
    .eq('id', ticketId)
    .single()
  if (error) throw error
  return data!
}

function marcar(
  asUser: Client,
  ticketId: string,
  delivered: boolean,
  expectedDeliveredAt: string | null = null,
) {
  return asUser.rpc('set_ticket_clearance_delivery', {
    p_ticket_id: ticketId,
    p_delivered: delivered,
    p_expected_delivered_at: expectedDeliveredAt,
  })
}

/**
 * La fila que devuelve la RPC. `returns table` con una sola fila, pero el tipo
 * generado dice «array», y con `noUncheckedIndexedAccess` un índice puede ser
 * `undefined`: se comprueba una vez aquí en vez de con un `!` en cada prueba.
 */
function fila(data: Awaited<ReturnType<typeof marcar>>['data']) {
  const row = (data ?? [])[0]
  expect(row, 'la RPC debe devolver el estado resultante').toBeDefined()
  return row!
}

/** Enciende el interruptor y devuelve la fecha que escribió el servidor. */
async function entregar(ticketId: string, asUser: Client = seller1): Promise<string> {
  const { data, error } = await marcar(asUser, ticketId, true, null)
  if (error) throw new Error(`No se pudo marcar la entrega: ${error.message}`)
  return fila(data).clearance_receipt_delivered_at!
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
  owner = await signInAs(USERS.owner)
  admin = await signInAs(USERS.admin)
  otherOrgSeller = await signInAs(USERS.otherOrgSeller)

  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  clienteA = await crearCliente(ctx.ids.seller1, 'Paz y Salvo Cliente A', '3220000001')
  clienteB = await crearCliente(ctx.ids.seller1, 'Paz y Salvo Cliente B', '3220000002')
  clienteDeSeller2 = await crearCliente(ctx.ids.seller2, 'Paz y Salvo Equipo', '3220000003')
}, 60_000)

afterAll(async () => {
  try {
    await db.query('begin')
    await db.query(
      `delete from payment_allocations
        where payment_id in (select id from payments where client_id = any($1::uuid[]))`,
      [clientesCreados],
    )
    await db.query(`delete from payments where client_id = any($1::uuid[])`, [clientesCreados])
    await db.query(`delete from notifications where entity_id = any($1::uuid[])`, [ticketsCreados])
    await db.query(`delete from audit_logs where entity_id = any($1::uuid[])`, [ticketsCreados])
    await db.query(`delete from tickets where id = any($1::uuid[])`, [ticketsCreados])
    await db.query(`delete from clients where id = any($1::uuid[])`, [clientesCreados])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  }

  const { rows } = await db.query(
    `select count(*)::int as n from tickets where id = any($1::uuid[])`,
    [ticketsCreados],
  )
  expect(rows[0].n, 'la suite debe dejar la base como la encontró').toBe(0)

  await db.end()
}, 60_000)

describe('E13-01 quién puede registrar la entrega (BR-I15)', () => {
  it('el vendedor marca su propia boleta', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { data, error } = await marcar(seller1, ticketId, true, null)
    expect(error).toBeNull()
    expect(fila(data).clearance_receipt_delivered_at).not.toBeNull()

    const despues = await estado(ticketId)
    expect(despues.clearance_receipt_delivered_at).not.toBeNull()
  })

  it('otro vendedor de la misma organización es rechazado', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await marcar(seller2, ticketId, true, null)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no existe o no tienes acceso/i)
    expect((await estado(ticketId)).clearance_receipt_delivered_at).toBeNull()
  })

  it('el vendedor padre no puede sobre la boleta de un integrante de su equipo', async () => {
    // `vendedor2` pasa a ser del equipo de `vendedor1`: sigue siendo su boleta,
    // y liderar un equipo no da permiso de escritura sobre ella (D-092).
    const ticketId = await boletaVendida(clienteDeSeller2, ctx.ids.seller2)
    const { error: teamError } = await ctx.svc
      .from('memberships')
      .update({ parent_seller_id: ctx.ids.seller1 })
      .eq('profile_id', ctx.ids.seller2)
      .eq('organization_id', ctx.demoOrg.id)
    expect(teamError).toBeNull()

    try {
      const { error } = await marcar(seller1, ticketId, true, null)
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/no existe o no tienes acceso/i)
      expect((await estado(ticketId)).clearance_receipt_delivered_at).toBeNull()
    } finally {
      await ctx.svc
        .from('memberships')
        .update({ parent_seller_id: null })
        .eq('profile_id', ctx.ids.seller2)
        .eq('organization_id', ctx.demoOrg.id)
    }
  })

  it('el Dueño no puede invocar la mutación', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await marcar(owner, ticketId, true, null)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/solo el vendedor de la boleta/i)
    expect((await estado(ticketId)).clearance_receipt_delivered_at).toBeNull()
  })

  it('el Administrador tampoco', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await marcar(admin, ticketId, true, null)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/solo el vendedor de la boleta/i)
  })

  it('otra organización recibe el mismo mensaje que si la boleta no existiera', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await marcar(otherOrgSeller, ticketId, true, null)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no existe o no tienes acceso/i)
    // Ni una palabra sobre la rifa, el vendedor o el cliente de la boleta.
    expect(error!.message).not.toMatch(/vendedor de la boleta|rifa|cliente/i)
  })

  it('una sesión anónima no puede ejecutar la función', async () => {
    const ticketId = await boletaVendida(clienteA)
    const { anonClient } = await import('./helpers')

    const { error } = await marcar(anonClient(), ticketId, true, null)
    expect(error).not.toBeNull()
    expect((await estado(ticketId)).clearance_receipt_delivered_at).toBeNull()
  })

  it('una cuenta desactivada no puede operar (BR-A04)', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error: offError } = await ctx.svc
      .from('memberships')
      .update({ is_active: false })
      .eq('profile_id', ctx.ids.seller1)
      .eq('organization_id', ctx.demoOrg.id)
    expect(offError).toBeNull()

    try {
      // La sesión sigue abierta: es exactamente el caso que BR-A04 persigue.
      const { error } = await marcar(seller1, ticketId, true, null)
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/no existe o no tienes acceso/i)
      expect((await estado(ticketId)).clearance_receipt_delivered_at).toBeNull()
    } finally {
      // Por base de datos y en un `finally`: por la interfaz, un tiempo agotado
      // dejaría el seed roto para todas las suites siguientes (TESTING §3.1).
      await ctx.svc
        .from('memberships')
        .update({ is_active: true })
        .eq('profile_id', ctx.ids.seller1)
        .eq('organization_id', ctx.demoOrg.id)
    }
  })
})

describe('E13-02 solo sobre una boleta vendida (BR-I15)', () => {
  it('una boleta disponible es rechazada', async () => {
    const ticketId = await boletaDisponible()

    const { error } = await marcar(seller1, ticketId, true, null)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/solo se puede registrar el paz y salvo de una boleta vendida/i)
  })

  it('una boleta en borrador y una pendiente de aprobación son rechazadas', async () => {
    for (const status of ['draft', 'pending_approval'] as const) {
      const ticketId = await boletaDisponible({ inventoryStatus: status })
      const { error } = await marcar(seller1, ticketId, true, null)
      expect(error, status).not.toBeNull()
      expect(error!.message, status).toMatch(/boleta vendida/i)
    }
  })

  it('una boleta anulada es rechazada, pero CONSERVA lo registrado (BR-I06)', async () => {
    const ticketId = await boletaVendida(clienteA)
    const stamp = await entregar(ticketId)

    const { error: cancelError } = await owner.rpc('cancel_ticket', {
      p_ticket_id: ticketId,
      p_reason: 'Prueba de anulación con paz y salvo entregado',
    })
    expect(cancelError).toBeNull()

    const anulada = await estado(ticketId)
    expect(anulada.inventory_status).toBe('cancelled')
    // Es historia: se conserva tal cual, con su fecha.
    expect(anulada.clearance_receipt_delivered_at).toBe(stamp)

    const { error } = await marcar(seller1, ticketId, false, stamp)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/boleta vendida/i)
    expect((await estado(ticketId)).clearance_receipt_delivered_at).toBe(stamp)
  })
})

describe('E13-03 la fecha, la marca heredada y el estado de pago (BR-I15)', () => {
  it('la fecha manual la pone el servidor, no quien llama', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { rows: antes } = await db.query<{ ahora: Date }>('select now() as ahora')
    const stamp = await entregar(ticketId)
    const { rows: despues } = await db.query<{ ahora: Date }>('select now() as ahora')

    const escrita = new Date(stamp).getTime()
    expect(escrita).toBeGreaterThanOrEqual(antes[0]!.ahora.getTime())
    expect(escrita).toBeLessThanOrEqual(despues[0]!.ahora.getTime())
  })

  it('la activación manual deja la marca heredada en false', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { data } = await marcar(seller1, ticketId, true, null)
    expect(fila(data).clearance_receipt_assumed_delivered).toBe(false)
    expect((await estado(ticketId)).clearance_receipt_assumed_delivered).toBe(false)
  })

  it('desactivar deja la fecha en NULL y la marca heredada en false', async () => {
    const ticketId = await boletaVendida(clienteA)
    const stamp = await entregar(ticketId)

    const { data, error } = await marcar(seller1, ticketId, false, stamp)
    expect(error).toBeNull()
    expect(fila(data).clearance_receipt_delivered_at).toBeNull()
    expect(fila(data).clearance_receipt_assumed_delivered).toBe(false)

    const despues = await estado(ticketId)
    expect(despues.clearance_receipt_delivered_at).toBeNull()
    expect(despues.clearance_receipt_assumed_delivered).toBe(false)
  })

  it('una boleta heredada que se desmarca y se vuelve a marcar pasa a registro manual', async () => {
    const ticketId = await boletaVendida(clienteA)

    // Se simula la carga inicial de la migración sobre ESTA boleta: fecha vieja
    // y marca heredada. Es el único punto de la suite que escribe esas columnas
    // a mano, y por eso va con la clave de servicio y no por la RPC.
    const heredada = '2020-01-01T05:00:00.000000+00:00'
    const { error: seedError } = await ctx.svc
      .from('tickets')
      .update({
        clearance_receipt_delivered_at: heredada,
        clearance_receipt_assumed_delivered: true,
      })
      .eq('id', ticketId)
    expect(seedError).toBeNull()

    const { error: offError } = await marcar(seller1, ticketId, false, heredada)
    expect(offError).toBeNull()

    const stamp = await entregar(ticketId)
    const despues = await estado(ticketId)
    expect(despues.clearance_receipt_assumed_delivered).toBe(false)
    expect(despues.clearance_receipt_delivered_at).toBe(stamp)
    expect(new Date(stamp).getFullYear()).toBeGreaterThan(2020)
  })

  it('funciona igual en unpaid, partial y paid, y no toca ningún dato financiero', async () => {
    const casos: Array<{ abono: number; esperado: string }> = [
      { abono: 0, esperado: 'unpaid' },
      { abono: 40_000, esperado: 'partial' },
      { abono: 120_000, esperado: 'paid' },
    ]

    for (const caso of casos) {
      const ticketId = await boletaVendida(clienteA)
      if (caso.abono > 0) await abonar(clienteA, ticketId, caso.abono)

      const antes = await estado(ticketId)
      expect(antes.payment_status, caso.esperado).toBe(caso.esperado)

      const { error } = await marcar(seller1, ticketId, true, null)
      expect(error, caso.esperado).toBeNull()

      const despues = await estado(ticketId)
      expect(despues.clearance_receipt_delivered_at, caso.esperado).not.toBeNull()

      // Ni una sola columna de negocio se mueve.
      const { clearance_receipt_delivered_at: _a, ...restoAntes } = antes
      const { clearance_receipt_delivered_at: _b, ...restoDespues } = despues
      expect(restoDespues, caso.esperado).toEqual(restoAntes)
    }
  })

  it('no exige que la rifa esté activa: un papel se sigue pudiendo entregar', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error: closeError } = await ctx.svc
      .from('raffles')
      .update({ status: 'closed' })
      .eq('id', ctx.demoRaffle.id)
    expect(closeError).toBeNull()

    try {
      const { error } = await marcar(seller1, ticketId, true, null)
      expect(error).toBeNull()
      expect((await estado(ticketId)).clearance_receipt_delivered_at).not.toBeNull()
    } finally {
      await ctx.svc.from('raffles').update({ status: 'active' }).eq('id', ctx.demoRaffle.id)
    }
  })
})

describe('E13-04 concurrencia y trabajo inútil (D-170)', () => {
  it('una pantalla desactualizada no pisa un cambio más reciente', async () => {
    const ticketId = await boletaVendida(clienteA)
    const stamp = await entregar(ticketId)

    // La otra pestaña sigue creyendo que estaba pendiente.
    const { error } = await marcar(seller1, ticketId, false, null)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/cambió en otro dispositivo/i)
    expect((await estado(ticketId)).clearance_receipt_delivered_at).toBe(stamp)
  })

  it('dos activaciones simultáneas: una gana y la otra ve el estado nuevo', async () => {
    const ticketId = await boletaVendida(clienteA)

    const [a, b] = await Promise.all([
      marcar(seller1, ticketId, true, null),
      marcar(seller1, ticketId, true, null),
    ])

    // Las dos piden lo mismo desde el mismo punto de partida: la que llega
    // segunda encuentra la fila ya escrita y su `p_expected` desfasado.
    const okCount = [a, b].filter((r) => r.error === null).length
    expect(okCount).toBeGreaterThanOrEqual(1)
    const fila = await estado(ticketId)
    expect(fila.clearance_receipt_delivered_at).not.toBeNull()
    expect(fila.clearance_receipt_assumed_delivered).toBe(false)
  })

  it('pedir el valor que ya tiene no escribe ni deja bitácora', async () => {
    const ticketId = await boletaVendida(clienteA)
    const stamp = await entregar(ticketId)

    const contar = async () => {
      const { rows } = await db.query<{ n: number }>(
        `select count(*)::int as n from audit_logs
          where entity_id = $1 and new_values ? 'clearance_receipt_delivered_at'`,
        [ticketId],
      )
      return rows[0]!.n
    }
    const antes = await contar()
    const filaAntes = await estado(ticketId)

    const { data, error } = await marcar(seller1, ticketId, true, stamp)
    expect(error).toBeNull()
    // Devuelve el estado que hay, sin tocarlo.
    expect(fila(data).clearance_receipt_delivered_at).toBe(stamp)
    expect(await contar()).toBe(antes)
    expect(await estado(ticketId)).toEqual(filaAntes)
  })
})

describe('E13-05 la entrega es del cliente actual (BR-I15)', () => {
  it('cambiar de cliente devuelve el paz y salvo a pendiente', async () => {
    const ticketId = await boletaVendida(clienteA)
    await entregar(ticketId)

    const { error } = await seller1.rpc('reassign_ticket_client', {
      p_ticket_id: ticketId,
      p_expected_client_id: clienteA,
      p_new_client_id: clienteB,
      p_reason: 'El cliente correcto era otro',
    })
    expect(error).toBeNull()

    const despues = await estado(ticketId)
    expect(despues.client_id).toBe(clienteB)
    expect(despues.clearance_receipt_delivered_at).toBeNull()
    expect(despues.clearance_receipt_assumed_delivered).toBe(false)
  })

  it('un UPDATE directo de client_id también lo limpia: la regla vive en la base', async () => {
    const ticketId = await boletaVendida(clienteA)
    await entregar(ticketId)

    // Con la clave de servicio, saltándose la aplicación entera.
    const { error } = await ctx.svc
      .from('tickets')
      .update({ client_id: clienteB })
      .eq('id', ticketId)
    expect(error).toBeNull()
    expect((await estado(ticketId)).clearance_receipt_delivered_at).toBeNull()
  })

  it('liberar la boleta lo limpia (BR-I14)', async () => {
    const ticketId = await boletaVendida(clienteA)
    await entregar(ticketId)

    const { error } = await seller1.rpc('release_ticket_client', {
      p_ticket_id: ticketId,
      p_expected_client_id: clienteA,
      p_reason: 'El cliente ya no la quiere',
    })
    expect(error).toBeNull()

    const despues = await estado(ticketId)
    expect(despues.inventory_status).toBe('available')
    expect(despues.clearance_receipt_delivered_at).toBeNull()
    expect(despues.clearance_receipt_assumed_delivered).toBe(false)
  })

  it('registrar, corregir a $0 y anular abonos NO cambian el dato (BR-F16, BR-F17, BR-F09)', async () => {
    const ticketId = await boletaVendida(clienteA)
    const stamp = await entregar(ticketId)

    const paymentId = await abonar(clienteA, ticketId, 50_000)
    expect((await estado(ticketId)).clearance_receipt_delivered_at).toBe(stamp)

    const { error: editError } = await seller1.rpc('update_payment_allocation', {
      p_payment_id: paymentId,
      p_ticket_id: ticketId,
      p_amount: 0,
      p_expected_amount: 50_000,
    })
    expect(editError).toBeNull()
    expect((await estado(ticketId)).clearance_receipt_delivered_at).toBe(stamp)

    const { error: voidError } = await owner.rpc('void_payment', {
      p_payment_id: paymentId,
      p_reason: 'Prueba de anulación con paz y salvo entregado',
    })
    expect(voidError).toBeNull()

    const despues = await estado(ticketId)
    expect(despues.clearance_receipt_delivered_at).toBe(stamp)
    expect(despues.clearance_receipt_assumed_delivered).toBe(false)
  })

  it('la base impide una fila incoherente: heredada sin fecha, o entregada sin cliente', async () => {
    const ticketId = await boletaVendida(clienteA)

    const heredadaSinFecha = await db
      .query(
        `update tickets set clearance_receipt_assumed_delivered = true,
                            clearance_receipt_delivered_at = null
          where id = $1`,
        [ticketId],
      )
      .then(() => null)
      .catch((error: Error) => error)
    expect(heredadaSinFecha?.message).toMatch(/tickets_clearance_assumed_requires_delivery/)

    // La segunda no se puede provocar por UPDATE —el disparador limpia antes de
    // que el CHECK mire—, así que se comprueba por INSERT, que es el camino que
    // el CHECK cubre en solitario.
    const { daily, weekly } = randomNumbers()
    const entregadaSinCliente = await db
      .query(
        `insert into tickets (organization_id, raffle_id, seller_id, created_by,
                              daily_number, weekly_number, inventory_status,
                              clearance_receipt_delivered_at)
         values ($1, $2, $3, $4, $5, $6, 'available', now())`,
        [ctx.demoOrg.id, ctx.demoRaffle.id, ctx.ids.seller1, ctx.ids.owner, daily, weekly],
      )
      .then(() => null)
      .catch((error: Error) => error)
    expect(entregadaSinCliente?.message).toMatch(/tickets_clearance_requires_client/)
  })
})

describe('E13-06 auditoría (BR-D01)', () => {
  it('cada cambio deja actor, boleta, valor anterior y valor nuevo', async () => {
    const ticketId = await boletaVendida(clienteA)
    const stamp = await entregar(ticketId)

    const { rows } = await db.query(
      `select actor_profile_id, action, entity_type, entity_id, old_values, new_values, created_at
         from audit_logs
        where entity_id = $1 and new_values ? 'clearance_receipt_delivered_at'
        order by created_at desc
        limit 1`,
      [ticketId],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe('ticket.update')
    expect(rows[0].entity_type).toBe('ticket')
    expect(rows[0].actor_profile_id).toBe(ctx.ids.seller1)
    expect(rows[0].old_values.clearance_receipt_delivered_at).toBeNull()
    expect(rows[0].new_values.clearance_receipt_delivered_at).not.toBeNull()
    expect(rows[0].created_at).not.toBeNull()

    // Y al apagarlo, el cambio de la marca heredada viaja cuando cambia.
    await ctx.svc
      .from('tickets')
      .update({ clearance_receipt_assumed_delivered: true })
      .eq('id', ticketId)
    const { error } = await marcar(seller1, ticketId, false, stamp)
    expect(error).toBeNull()

    const { rows: apagado } = await db.query(
      `select old_values, new_values from audit_logs
        where entity_id = $1 and new_values ? 'clearance_receipt_delivered_at'
        order by created_at desc limit 1`,
      [ticketId],
    )
    expect(apagado[0].new_values.clearance_receipt_delivered_at).toBeNull()
    expect(apagado[0].old_values.clearance_receipt_assumed_delivered).toBe(true)
    expect(apagado[0].new_values.clearance_receipt_assumed_delivered).toBe(false)
  })
})

describe('E13-07 search_tickets devuelve las dos columnas (D-170)', () => {
  it('al buscar por número, con el mismo aislamiento y el mismo orden', async () => {
    const ticketId = await boletaVendida(clienteA)
    const fila = await estado(ticketId)
    const stamp = await entregar(ticketId)

    const { data, error } = await seller1.rpc('search_tickets', {
      p_search: fila.daily_number!,
      p_limit: 50,
      p_offset: 0,
    })
    expect(error).toBeNull()

    const encontrada = (data ?? []).find((row) => row.id === ticketId)
    expect(encontrada).toBeDefined()
    expect(encontrada!.clearance_receipt_delivered_at).toBe(stamp)
    expect(encontrada!.clearance_receipt_assumed_delivered).toBe(false)

    // Aislamiento: `vendedor2` no la encuentra, y el otro portal tampoco filtra.
    const ajena = await seller2.rpc('search_tickets', {
      p_search: fila.daily_number!,
      p_limit: 50,
      p_offset: 0,
    })
    expect(ajena.error).toBeNull()
    expect((ajena.data ?? []).some((row) => row.id === ticketId)).toBe(false)
  })

  it('al buscar por cliente, y el orden por relevancia sigue siendo el de 0029', async () => {
    const ticketId = await boletaVendida(clienteA)
    const stamp = await entregar(ticketId)

    const { data, error } = await seller1.rpc('search_tickets', {
      p_search: 'Paz y Salvo Cliente A',
      p_limit: 50,
      p_offset: 0,
    })
    expect(error).toBeNull()

    const encontrada = (data ?? []).find((row) => row.id === ticketId)
    expect(encontrada).toBeDefined()
    expect(encontrada!.clearance_receipt_delivered_at).toBe(stamp)
    // El nombre exacto es el escalón 0: todo lo devuelto es de ese cliente.
    expect((data ?? []).every((row) => row.client_name === 'Paz y Salvo Cliente A')).toBe(true)
  })

  it('la firma de entrada y los privilegios no cambiaron', async () => {
    const { rows } = await db.query(`
      select p.prosecdef,
             pg_get_function_arguments(p.oid) as args,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'search_tickets'
    `)
    expect(rows).toHaveLength(1)
    expect(rows[0].prosecdef, 'search_tickets sigue siendo SECURITY INVOKER').toBe(false)
    expect(rows[0].args).toBe(
      'p_search text, p_raffle_id uuid DEFAULT NULL::uuid, p_seller_id uuid DEFAULT NULL::uuid, ' +
        'p_client_id uuid DEFAULT NULL::uuid, ' +
        'p_inventory_status ticket_inventory_status DEFAULT NULL::ticket_inventory_status, ' +
        'p_payment_status ticket_payment_status DEFAULT NULL::ticket_payment_status, ' +
        'p_limit integer DEFAULT 20, p_offset integer DEFAULT 0',
    )
    expect(rows[0].auth).toBe(true)
    expect(rows[0].anon).toBe(false)
  })
})

describe('E13-08 privilegios de la RPC (SECURITY §4.5)', () => {
  it('SECURITY DEFINER, search_path fijo y EXECUTE solo donde toca', async () => {
    const { rows } = await db.query(`
      select p.prosecdef,
             p.proconfig,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as svc
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'set_ticket_clearance_delivery'
    `)
    expect(rows).toHaveLength(1)
    expect(rows[0].prosecdef).toBe(true)
    expect(rows[0].proconfig).toContain('search_path=public, pg_temp')
    expect(rows[0].auth).toBe(true)
    expect(rows[0].anon).toBe(false)
    expect(rows[0].svc).toBe(true)
  })

  it('`public` no conserva EXECUTE', async () => {
    const { rows } = await db.query(`
      select coalesce(array_to_string(p.proacl, ','), '') as acl
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'set_ticket_clearance_delivery'
    `)
    // Con `proacl` explícita, un privilegio de PUBLIC se escribiría como `=X/`.
    expect(rows[0].acl).not.toMatch(/(^|,)=X\//)
  })
})

describe('E13-09 la carga inicial de la migración 0049 (D-170)', () => {
  /**
   * La sentencia SE LEE DEL ARCHIVO DE MIGRACIÓN, no se copia aquí: así lo que
   * se prueba es exactamente lo que se va a ejecutar sobre producción. Si
   * alguien la cambiara, esta prueba probaría la nueva.
   */
  function sentenciaDeCargaInicial(): string {
    const ruta = resolve(__dirname, '../../supabase/migrations/0049_ticket_clearance_receipt.sql')
    const sql = readFileSync(ruta, 'utf8')
    const inicio = sql.lastIndexOf('update tickets')
    expect(inicio, 'la migración 0049 debe contener el UPDATE de la carga inicial').toBeGreaterThan(
      0,
    )
    const fin = sql.indexOf(';', inicio)
    const sentencia = sql.slice(inicio, fin + 1)
    // Las tres condiciones que acotan el alcance, tal como las pide el encargo.
    expect(sentencia).toContain("inventory_status = 'assigned'")
    expect(sentencia).toContain('client_id is not null')
    expect(sentencia).toContain('clearance_receipt_delivered_at is null')
    return sentencia
  }

  it('marca exactamente las boletas vendidas y deja intactas las demás', async () => {
    // Escenario: cuatro boletas, una de cada clase.
    const vendida = await boletaVendida(clienteA)
    const disponible = await boletaDisponible()
    const borrador = await boletaDisponible({ inventoryStatus: 'draft' })
    const anulada = await boletaVendida(clienteA)
    const { error: cancelError } = await owner.rpc('cancel_ticket', {
      p_ticket_id: anulada,
      p_reason: 'Prueba de alcance de la carga inicial',
    })
    expect(cancelError).toBeNull()

    const antes = {
      vendida: await estado(vendida),
      disponible: await estado(disponible),
      borrador: await estado(borrador),
      anulada: await estado(anulada),
    }

    // Se ejecuta la carga inicial DE VERDAD, sobre toda la tabla, y se revierte.
    await db.query('begin')
    try {
      const { rowCount } = await db.query(sentenciaDeCargaInicial())
      expect(
        rowCount,
        'la carga inicial debe tocar al menos la boleta del escenario',
      ).toBeGreaterThan(0)

      const leer = async (id: string) => {
        const { rows } = await db.query(
          `select inventory_status, client_id, sale_price, base_price, paid_amount, payment_status,
                  sale_date, assigned_at, seller_id, daily_number, weekly_number,
                  clearance_receipt_delivered_at, clearance_receipt_assumed_delivered
             from tickets where id = $1`,
          [id],
        )
        return rows[0]
      }

      // 1. La vendida queda entregada Y marcada como heredada.
      const v = await leer(vendida)
      expect(v.clearance_receipt_delivered_at).not.toBeNull()
      expect(v.clearance_receipt_assumed_delivered).toBe(true)

      // 2. Ninguna otra se toca: ni disponible, ni borrador, ni anulada.
      for (const [nombre, id] of [
        ['disponible', disponible],
        ['borrador', borrador],
        ['anulada', anulada],
      ] as const) {
        const fila = await leer(id)
        expect(fila.clearance_receipt_delivered_at, nombre).toBeNull()
        expect(fila.clearance_receipt_assumed_delivered, nombre).toBe(false)
      }

      // 3. No se movió ni un campo financiero, comercial ni de identidad.
      for (const [nombre, id] of [
        ['vendida', vendida],
        ['disponible', disponible],
        ['borrador', borrador],
        ['anulada', anulada],
      ] as const) {
        const fila = await leer(id)
        const previo = antes[nombre]
        expect(fila.inventory_status, nombre).toBe(previo.inventory_status)
        expect(fila.client_id, nombre).toBe(previo.client_id)
        expect(Number(fila.paid_amount), nombre).toBe(previo.paid_amount)
        expect(fila.payment_status, nombre).toBe(previo.payment_status)
        expect(fila.sale_price === null ? null : Number(fila.sale_price), nombre).toBe(
          previo.sale_price,
        )
        expect(fila.base_price === null ? null : Number(fila.base_price), nombre).toBe(
          previo.base_price,
        )
        expect(fila.seller_id, nombre).toBe(previo.seller_id)
        expect(fila.daily_number, nombre).toBe(previo.daily_number)
        expect(fila.weekly_number, nombre).toBe(previo.weekly_number)
      }

      // 4. Queda auditada con actor de SISTEMA (nulo): eso es lo que la
      //    distingue de una activación manual.
      const { rows: bitacora } = await db.query(
        `select actor_profile_id, old_values, new_values from audit_logs
          where entity_id = $1 and new_values ? 'clearance_receipt_assumed_delivered'
          order by created_at desc limit 1`,
        [vendida],
      )
      expect(bitacora).toHaveLength(1)
      expect(bitacora[0].actor_profile_id).toBeNull()
      expect(bitacora[0].new_values.clearance_receipt_assumed_delivered).toBe(true)
    } finally {
      await db.query('rollback')
    }

    // Revertida: la base queda como estaba.
    expect((await estado(vendida)).clearance_receipt_delivered_at).toBeNull()
  })

  it('una venta posterior a la migración empieza con el paz y salvo pendiente', async () => {
    const ticketId = await boletaVendida(clienteB)

    const fila = await estado(ticketId)
    expect(fila.inventory_status).toBe('assigned')
    expect(fila.clearance_receipt_delivered_at).toBeNull()
    expect(fila.clearance_receipt_assumed_delivered).toBe(false)
  })
})
