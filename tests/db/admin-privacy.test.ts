/**
 * La cartera es del vendedor (D-198, BR-Q01..BR-Q10, docs/SECURITY.md §4.19).
 *
 * El Dueño y el Administrador ya no leen ni tocan la informacion comercial de
 * ningun vendedor: quien le compro, a que precio, cuanto abono, cuanto debe ni
 * su historial de pagos. Lo que administran —numeros, rifa, vendedor, estado de
 * inventario y un estado de pago en DOS valores— les llega por las proyecciones
 * `admin_*`, que devuelven una lista blanca y nada mas.
 *
 * Todo con sesiones reales y la clave publica. La service role y la conexion de
 * superusuario solo PREPARAN datos y sirven de consulta de control; nunca
 * demuestran lo que ve una persona (D-043).
 *
 * Lo que se junta aqui y ninguna otra suite cubre entero: que la cartera no se
 * lea por ninguna puerta —tabla, vista, RPC, bitacora, aviso—, que las
 * proyecciones no traigan ni un campo de mas, que los valores secretos no
 * viajen en ninguna respuesta del personal, que un rechazo no delate nada, y
 * que el vendedor conserve su cartera entera.
 */
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
let owner: Client
let admin: Client
let seller1: Client
let seller2: Client
let otherOrgOwner: Client

const STAMP = Date.now().toString(36)

/** Lo que NO puede aparecer en nada de lo que recibe el personal. */
const SECRETO = {
  nombre: `Privacidad Zeta ${STAMP}`,
  alias: `Alias Omega ${STAMP}`,
  telefono: `31${String(Date.now() % 100_000_000).padStart(8, '0')}`,
  correo: `zeta-${STAMP}@privado.test`,
}

/** Un abono con cifras que ningun recuento puede dar por casualidad. */
const ABONO = 13_579

let precio: number
/** Precio de venta rebajado: tampoco lo puede ver el personal (BR-P09). */
let precioRebajado: number
let clienteSecreto: string

const boletas = { sinPagar: '', abonada: '', pagada: '', disponible: '' }
const creadas: string[] = []

const RECHAZO_DE_CARTERA = /no existe o no tienes acceso/i

/** Una boleta disponible de vendedor1, con numeros libres. */
async function boletaDisponible(): Promise<string> {
  for (let intento = 0; intento < 25; intento += 1) {
    const { daily, weekly } = randomNumbers()
    const created = await insertTicket(ctx.svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
    })
    if (created.error) {
      if (created.error.code === '23505') continue
      throw new Error(`No se pudo crear la boleta: ${created.error.message}`)
    }
    creadas.push(created.data!.id)
    return created.data!.id
  }
  throw new Error('No se encontró una combinación libre en 25 intentos')
}

async function vender(ticketId: string) {
  const { error } = await seller1.rpc('bulk_assign_tickets', {
    p_ticket_ids: [ticketId],
    p_client_id: clienteSecreto,
    p_sale_price: precioRebajado,
  })
  if (error) throw new Error(`No se pudo vender: ${error.message}`)
}

async function abonar(ticketId: string, amount: number) {
  const { error } = await seller1.rpc('create_payment', {
    p_client_id: clienteSecreto,
    p_total_amount: amount,
    p_allocations: [{ ticket_id: ticketId, amount }],
  })
  if (error) throw new Error(`No se pudo abonar: ${error.message}`)
}

/**
 * Un numero sensible como VALOR de un JSON: detras de `:`, `[` o `,`, o entre
 * comillas. Asi no lo confunde con las cifras de una fecha con microsegundos.
 */
function contieneNumero(texto: string, numero: number): boolean {
  return new RegExp(`([:\\[,]\\s*${numero}(?![0-9.])|"${numero}")`).test(texto)
}

beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  ctx = await loadSeedContext()
  ;[owner, admin, seller1, seller2, otherOrgOwner] = await Promise.all([
    signInAs(USERS.owner),
    signInAs(USERS.admin),
    signInAs(USERS.seller1),
    signInAs(USERS.seller2),
    signInAs(USERS.otherOrgOwner),
  ])

  const { data: rifa, error: rifaError } = await ctx.svc
    .from('raffles')
    .select('ticket_price')
    .eq('id', ctx.demoRaffle.id)
    .single()
  if (rifaError) throw rifaError
  precio = Number(rifa.ticket_price)
  precioRebajado = precio - 1_234

  const { data: cliente, error: clienteError } = await ctx.svc
    .from('clients')
    .insert({
      organization_id: ctx.demoOrg.id,
      seller_id: ctx.ids.seller1,
      name: SECRETO.nombre,
      alias: SECRETO.alias,
      phone: SECRETO.telefono,
      email: SECRETO.correo,
    })
    .select('id')
    .single()
  if (clienteError) throw clienteError
  clienteSecreto = cliente.id

  boletas.sinPagar = await boletaDisponible()
  boletas.abonada = await boletaDisponible()
  boletas.pagada = await boletaDisponible()
  boletas.disponible = await boletaDisponible()

  for (const id of [boletas.sinPagar, boletas.abonada, boletas.pagada]) await vender(id)
  await abonar(boletas.abonada, ABONO)
  await abonar(boletas.pagada, precioRebajado)
}, 60_000)

/**
 * Todo lo creado se borra en UNA transaccion: `payments_balanced` es un
 * constraint trigger diferido (I-059), y las asignaciones van antes que los
 * pagos, el ledger antes que las boletas y las boletas antes que el cliente.
 */
afterAll(async () => {
  try {
    await db.query('begin')
    await db.query(
      `delete from audit_logs
        where entity_id in (select id from payments where client_id = $1)`,
      [clienteSecreto],
    )
    await db.query(
      `delete from payment_allocations
        where payment_id in (select id from payments where client_id = $1)`,
      [clienteSecreto],
    )
    await db.query(`delete from payments where client_id = $1`, [clienteSecreto])
    await db.query(`delete from notifications where entity_id = any($1::uuid[])`, [creadas])
    await db.query(`delete from audit_logs where entity_id = any($1::uuid[]) or entity_id = $2`, [
      creadas,
      clienteSecreto,
    ])
    await db.query(`delete from commission_ledger where ticket_id = any($1::uuid[])`, [creadas])
    await db.query(`delete from tickets where id = any($1::uuid[])`, [creadas])
    await db.query(`delete from clients where id = $1`, [clienteSecreto])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  } finally {
    await db.end()
  }
}, 60_000)

// ===========================================================================
// BR-Q01 — ninguna puerta a la cartera
// ===========================================================================

describe('BR-Q01 el personal no lee la cartera por ninguna tabla ni vista', () => {
  it('ni el cliente, ni la boleta, ni los pagos, tampoco pidiendolos por su id', async () => {
    const vendidas = [boletas.sinPagar, boletas.abonada, boletas.pagada]

    for (const [quien, sesion] of [
      ['Dueño', owner],
      ['Administrador', admin],
    ] as const) {
      const cliente = await sesion
        .from('clients')
        .select('id, name, phone')
        .eq('id', clienteSecreto)
      expect(cliente.error, quien).toBeNull()
      expect(cliente.data, `${quien}: clients`).toEqual([])

      const tickets = await sesion
        .from('tickets')
        .select('id, client_id, sale_price, paid_amount')
        .in('id', vendidas)
      expect(tickets.data, `${quien}: tickets`).toEqual([])

      const pagos = await sesion
        .from('payments')
        .select('id, total_amount')
        .eq('client_id', clienteSecreto)
      expect(pagos.data, `${quien}: payments`).toEqual([])

      const asignaciones = await sesion
        .from('payment_allocations')
        .select('id, amount')
        .in('ticket_id', vendidas)
      expect(asignaciones.data, `${quien}: payment_allocations`).toEqual([])

      for (const tabla of ['clients', 'tickets', 'payments', 'payment_allocations'] as const) {
        const { count, error } = await sesion
          .from(tabla)
          .select('id', { count: 'exact', head: true })
        expect(error, `${quien}: ${tabla}`).toBeNull()
        expect(count, `${quien}: recuento de ${tabla}`).toBe(0)
      }
    }
  })

  it('ni por las vistas, que heredan la RLS de quien consulta', async () => {
    const vendidas = [boletas.sinPagar, boletas.abonada, boletas.pagada]

    for (const sesion of [owner, admin]) {
      const saldos = await sesion
        .from('v_client_balances')
        .select('client_id')
        .eq('client_id', clienteSecreto)
      expect(saldos.data).toEqual([])

      const historial = await sesion
        .from('v_payment_history')
        .select('payment_id')
        .eq('client_id', clienteSecreto)
      expect(historial.data).toEqual([])

      const balances = await sesion
        .from('v_ticket_balances')
        .select('ticket_id')
        .in('ticket_id', vendidas)
      expect(balances.data).toEqual([])
    }
  })

  it('ni las comisiones de ningun vendedor, que su vendedor si ve', async () => {
    for (const sesion of [owner, admin]) {
      const comisiones = await sesion.from('seller_commissions').select('seller_id')
      expect(comisiones.data).toEqual([])
      const ledger = await sesion.from('commission_ledger').select('seller_id')
      expect(ledger.data).toEqual([])
      const resumen = await sesion.rpc('commission_summary', { p_raffle_id: ctx.demoRaffle.id })
      expect(resumen.error).toBeNull()
      expect(resumen.data).toEqual([])
    }

    const propia = await seller1
      .from('seller_commissions')
      .select('seller_id')
      .eq('seller_id', ctx.ids.seller1)
    expect(propia.data!.length).toBeGreaterThan(0)
  })

  it('ni los limites de precio de una boleta vendida', async () => {
    for (const sesion of [owner, admin]) {
      const { data, error } = await sesion.rpc('ticket_sale_price_limits', {
        p_ticket_id: boletas.abonada,
      })
      expect(error).toBeNull()
      expect(data).toEqual([])
    }

    const propios = await seller1.rpc('ticket_sale_price_limits', { p_ticket_id: boletas.abonada })
    expect(propios.data).toHaveLength(1)
  })

  it('la bitacora ya no tiene politica, y solo la service role la lee entera', async () => {
    const { rows } = await db.query(
      `select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = 'audit_logs'`,
    )
    expect(rows[0].n).toBe(0)

    for (const sesion of [owner, admin, seller1]) {
      const { data, error } = await sesion.from('audit_logs').select('id').limit(1)
      expect(error).toBeNull()
      expect(data).toEqual([])
    }

    const { data: completa } = await ctx.svc
      .from('audit_logs')
      .select('action, new_values')
      .eq('entity_id', boletas.abonada)
    expect(JSON.stringify(completa)).toContain(clienteSecreto)
  })
})

// ===========================================================================
// BR-Q02 — la proyeccion es una lista blanca
// ===========================================================================

describe('BR-Q02 lo que devuelve la proyeccion administrativa es una lista blanca', () => {
  it('cada funcion devuelve exactamente sus columnas', async () => {
    const { data: lista } = await owner.rpc('admin_list_tickets', {
      p_ticket_ids: [boletas.abonada],
    })
    expect(Object.keys(lista![0]!).sort()).toEqual([
      'clearance_state',
      'daily_number',
      'id',
      'inventory_status',
      'payment_state',
      'raffle_id',
      'raffle_name',
      'raffle_short_code',
      'seller_id',
      'total_count',
      'weekly_number',
    ])

    const { data: detalle } = await owner.rpc('admin_ticket_detail', {
      p_ticket_id: boletas.abonada,
    })
    expect(Object.keys(detalle![0]!).sort()).toEqual([
      'approved_at',
      'cancel_reason',
      'cancelled_at',
      'clearance_delivered_at',
      'clearance_state',
      'created_at',
      'daily_number',
      'id',
      'internal_code',
      'inventory_status',
      'payment_state',
      'raffle_id',
      'raffle_name',
      'raffle_short_code',
      'raffle_status',
      'sale_date',
      'seller_id',
      'weekly_number',
    ])

    const { data: elegibilidad } = await owner.rpc('admin_ticket_bulk_eligibility', {
      p_ticket_ids: [boletas.abonada],
    })
    expect(Object.keys(elegibilidad![0]!).sort()).toEqual([
      'can_approve',
      'can_cancel',
      'can_change_seller',
      'can_delete',
      'daily_number',
      'inventory_status',
      'raffle_active',
      'raffle_id',
      'seller_id',
      'ticket_id',
      'weekly_number',
    ])

    const { data: inventario } = await owner.rpc('admin_ticket_inventory', {
      p_raffle_id: ctx.demoRaffle.id,
    })
    expect(Object.keys(inventario![0]!).sort()).toEqual([
      'raffle_id',
      'seller_id',
      'tickets_assigned',
      'tickets_available',
      'tickets_cancelled',
      'tickets_draft',
      'tickets_not_paid',
      'tickets_paid',
      'tickets_pending_approval',
      'tickets_total',
    ])

    const { data: bitacora } = await owner.rpc('admin_audit_log', { p_limit: 1 })
    expect(Object.keys(bitacora![0]!).sort()).toEqual([
      'action',
      'actor_profile_id',
      'created_at',
      'entity_id',
      'entity_type',
      'id',
      'new_values',
      'old_values',
      'organization_id',
    ])
  })

  it('el catalogo lo confirma: ninguna funcion administrativa declara una columna de la cartera', async () => {
    const { rows } = await db.query(`
      select p.proname, pg_get_function_result(p.oid) as resultado
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'admin\\_%'
      order by p.proname
    `)

    expect(rows.map((r) => r.proname)).toEqual([
      'admin_audit_log',
      'admin_audit_redact',
      'admin_list_tickets',
      'admin_lottery_matches',
      // 0067 (D-208): el historial de premios ganados del personal. Como el
      // resto, su tipo de retorno no declara cliente, precio ni saldo.
      'admin_prize_award_totals',
      'admin_prize_awards',
      'admin_ticket_bulk_eligibility',
      'admin_ticket_detail',
      'admin_ticket_inventory',
      'admin_update_ticket_numbers',
    ])

    const PROHIBIDAS =
      /\b(client_id|client_name|sale_price|base_price|min_sale_price|paid_amount|pending_amount|payment_status|total_amount|amount|phone|email|alias|notes)\b/
    for (const row of rows) expect(row.resultado, row.proname).not.toMatch(PROHIBIDAS)
  })

  it('ningun valor secreto viaja en lo que recibe el personal', async () => {
    const ids = [boletas.sinPagar, boletas.abonada, boletas.pagada, boletas.disponible]
    const respuestas: unknown[] = []

    for (const sesion of [owner, admin]) {
      respuestas.push(
        await sesion.rpc('admin_list_tickets', { p_ticket_ids: ids, p_limit: 10 }),
        await sesion.rpc('admin_ticket_bulk_eligibility', { p_ticket_ids: ids }),
        await sesion.rpc('admin_ticket_inventory', { p_raffle_id: ctx.demoRaffle.id }),
      )
      for (const id of ids) {
        respuestas.push(
          await sesion.rpc('admin_ticket_detail', { p_ticket_id: id }),
          await sesion.rpc('admin_audit_log', { p_entity_id: id, p_limit: 500 }),
        )
      }
      respuestas.push(await sesion.from('notifications').select('*').in('entity_id', ids))
    }

    const texto = JSON.stringify(respuestas)
    // Lo que se reviso no esta vacio: las respuestas si traen las boletas.
    for (const id of ids) expect(texto).toContain(id)

    for (const valor of [
      SECRETO.nombre,
      SECRETO.alias,
      SECRETO.telefono,
      SECRETO.correo,
      clienteSecreto,
    ]) {
      expect(texto, `el personal recibio «${valor}»`).not.toContain(valor)
    }
    expect(contieneNumero(texto, precioRebajado), 'el precio de venta').toBe(false)
    expect(contieneNumero(texto, ABONO), 'el abono').toBe(false)
  })

  it('la bitacora que ve el personal no trae ni un dato de la venta', async () => {
    const PERMITIDAS: Record<string, readonly string[]> = {
      ticket: [
        'id',
        'organization_id',
        'raffle_id',
        'seller_id',
        'internal_code',
        'daily_number',
        'weekly_number',
        'inventory_status',
        'created_by',
        'created_at',
        'approved_by',
        'approved_at',
        'cancelled_at',
        'cancel_reason',
        'clearance_receipt_delivered_at',
        'clearance_receipt_assumed_delivered',
        'count',
        'reason',
        'ticket_ids',
        'tickets',
        'requested',
        'inserted',
        'skipped',
        'source',
      ],
      membership: [
        'id',
        'organization_id',
        'profile_id',
        'role',
        'is_active',
        'invited_by',
        'created_at',
        'parent_seller_id',
        'commission_model',
        'fixed_commission_amount',
        'public_slug',
        'public_catalog_enabled',
        'public_whatsapp_number',
        'public_raffle_id',
      ],
    }

    const { data, error } = await owner.rpc('admin_audit_log', { p_limit: 500 })
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)

    for (const fila of data!) {
      expect(['ticket', 'raffle', 'membership', 'user']).toContain(fila.entity_type)
      expect([
        'ticket.assign_client',
        'ticket.bulk_assign',
        'ticket.update_sale_price',
        'ticket.reassign_client',
        'ticket.release_client',
      ]).not.toContain(fila.action)

      const permitidas = PERMITIDAS[fila.entity_type]
      if (!permitidas) continue
      for (const valores of [fila.old_values, fila.new_values]) {
        const claves = Object.keys((valores ?? {}) as Record<string, unknown>)
        for (const clave of claves) expect(permitidas, `${fila.action}: ${clave}`).toContain(clave)
      }
    }
  })
})

// ===========================================================================
// BR-Q04 — dos estados de pago
// ===========================================================================

describe('BR-Q04 el personal ve dos estados de pago; la base conserva los tres', () => {
  const todas = () => [boletas.sinPagar, boletas.abonada, boletas.pagada, boletas.disponible]

  async function detalle(id: string) {
    const { data, error } = await owner.rpc('admin_ticket_detail', { p_ticket_id: id })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    return data![0]!
  }

  it('la misma boleta abonada: «Sin pagar» para el personal, «Abonada» para su vendedor', async () => {
    expect((await detalle(boletas.abonada)).payment_state).toBe('unpaid')

    const { data: delVendedor } = await seller1
      .from('tickets')
      .select('payment_status, paid_amount, sale_price')
      .eq('id', boletas.abonada)
      .single()
    expect(delVendedor).toEqual({
      payment_status: 'partial',
      paid_amount: ABONO,
      sale_price: precioRebajado,
    })

    const { rows } = await db.query('select payment_status from tickets where id = $1', [
      boletas.abonada,
    ])
    expect(rows[0].payment_status).toBe('partial')
  })

  it('sin abonos es «Sin pagar», pagada es «Pagada», y sin vender no tiene estado de pago', async () => {
    expect((await detalle(boletas.sinPagar)).payment_state).toBe('unpaid')
    expect((await detalle(boletas.pagada)).payment_state).toBe('paid')

    const disponible = await detalle(boletas.disponible)
    expect(disponible.payment_state).toBeNull()
    expect(disponible.sale_date).toBeNull()
    expect(disponible.clearance_state).toBeNull()
  })

  it('el filtro «Sin pagar» incluye las abonadas; «Pagada», solo las pagadas', async () => {
    const filtrar = async (estado?: 'unpaid' | 'paid') => {
      const { data, error } = await owner.rpc('admin_list_tickets', {
        p_ticket_ids: todas(),
        ...(estado ? { p_payment_state: estado } : {}),
      })
      expect(error).toBeNull()
      return data!
    }

    const sinPagar = await filtrar('unpaid')
    expect(sinPagar.map((fila) => fila.id).sort()).toEqual(
      [boletas.sinPagar, boletas.abonada].sort(),
    )
    expect(sinPagar.every((fila) => Number(fila.total_count) === 2)).toBe(true)

    expect((await filtrar('paid')).map((fila) => fila.id)).toEqual([boletas.pagada])
    expect(await filtrar()).toHaveLength(4)
  })

  it('el recuento del filtro se resuelve antes de paginar', async () => {
    const { data, error } = await owner.rpc('admin_list_tickets', {
      p_ticket_ids: todas(),
      p_payment_state: 'unpaid',
      p_limit: 1,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(Number(data![0]!.total_count)).toBe(2)
  })

  it('«partial» no es un estado de pago del personal', async () => {
    const { error } = await owner.rpc('admin_list_tickets', { p_payment_state: 'partial' })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/estado de pago no es válido/i)
  })
})

// ===========================================================================
// BR-Q05 — busqueda solo por numero
// ===========================================================================

describe('BR-Q05 el personal busca solo por numero', () => {
  it('encuentra la boleta por su numero diario y por el semanal', async () => {
    const { rows } = await db.query(
      'select daily_number, weekly_number from tickets where id = $1',
      [boletas.abonada],
    )

    for (const numero of [rows[0].daily_number as string, rows[0].weekly_number as string]) {
      const { data, error } = await owner.rpc('admin_list_tickets', {
        p_search: numero,
        p_limit: 1000,
      })
      expect(error).toBeNull()
      expect(
        data!.map((fila) => fila.id),
        numero,
      ).toContain(boletas.abonada)
    }
  })

  it('un nombre, un telefono, un correo o un codigo no encuentran nada, igual que algo inexistente', async () => {
    const { rows } = await db.query('select internal_code from tickets where id = $1', [
      boletas.abonada,
    ])
    const inexistente = await owner.rpc('admin_list_tickets', { p_search: 'Nadie Existe Asi' })
    expect(inexistente.error).toBeNull()
    expect(inexistente.data).toEqual([])

    for (const termino of [
      SECRETO.nombre,
      SECRETO.alias,
      SECRETO.telefono,
      SECRETO.correo,
      rows[0].internal_code as string,
      '12345',
    ]) {
      const { data, error } = await owner.rpc('admin_list_tickets', { p_search: termino })
      expect(error, termino).toBeNull()
      expect(data, termino).toEqual(inexistente.data)
    }
  })
})

// ===========================================================================
// BR-Q06 / BR-Q07 — el personal no toca la cartera, y el rechazo no delata nada
// ===========================================================================

describe('BR-Q06 el personal no toca la cartera', () => {
  it('ni escribiendo directo en las tablas', async () => {
    const insertarCliente = await owner.from('clients').insert({
      organization_id: ctx.demoOrg.id,
      seller_id: ctx.ids.seller1,
      name: `Intruso ${STAMP}`,
      phone: '3009990001',
    })
    expect(insertarCliente.error).not.toBeNull()

    const editarCliente = await owner
      .from('clients')
      .update({ name: 'Cambiado por el personal' })
      .eq('id', clienteSecreto)
      .select('id')
    expect(editarCliente.data ?? []).toEqual([])

    const editarBoleta = await owner
      .from('tickets')
      .update({ inventory_status: 'available' })
      .eq('id', boletas.sinPagar)
      .select('id')
    expect(editarBoleta.data ?? []).toEqual([])

    const pago = await owner.from('payments').insert({
      organization_id: ctx.demoOrg.id,
      seller_id: ctx.ids.seller1,
      client_id: clienteSecreto,
      total_amount: 1_000,
      created_by: ctx.ids.owner,
    })
    expect(pago.error).not.toBeNull()

    // Una boleta con cliente o precio tampoco la puede crear el personal.
    const idConCliente = crypto.randomUUID()
    const { daily, weekly } = randomNumbers()
    const conCliente = await owner.from('tickets').insert({
      id: idConCliente,
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      daily_number: daily,
      weekly_number: weekly,
      inventory_status: 'available',
      created_by: ctx.ids.owner,
      client_id: clienteSecreto,
    })
    expect(conCliente.error).not.toBeNull()

    // Y nada cambio.
    const { rows: cliente } = await db.query('select name from clients where id = $1', [
      clienteSecreto,
    ])
    expect(cliente[0].name).toBe(SECRETO.nombre)
    const { rows: boleta } = await db.query(
      'select inventory_status, client_id from tickets where id = $1',
      [boletas.sinPagar],
    )
    expect(boleta[0]).toEqual({ inventory_status: 'assigned', client_id: clienteSecreto })
    const { rows: fantasma } = await db.query(
      'select count(*)::int as n from tickets where id = $1',
      [idConCliente],
    )
    expect(fantasma[0].n).toBe(0)
  })

  it('ni por las RPC de la cartera: recibe exactamente lo mismo que un vendedor ajeno', async () => {
    const { rows: pagos } = await db.query(
      'select id from payments where client_id = $1 order by created_at limit 1',
      [clienteSecreto],
    )
    const pagoId = pagos[0].id as string

    const llamadas: [
      string,
      (sesion: Client) => PromiseLike<{ error: { message: string } | null }>,
    ][] = [
      [
        'assign_ticket',
        (s) =>
          s.rpc('assign_ticket', { p_ticket_id: boletas.disponible, p_client_id: clienteSecreto }),
      ],
      [
        'create_payment',
        (s) =>
          s.rpc('create_payment', {
            p_client_id: clienteSecreto,
            p_total_amount: 1_000,
            p_allocations: [{ ticket_id: boletas.sinPagar, amount: 1_000 }],
          }),
      ],
      [
        'update_payment_allocation',
        (s) =>
          s.rpc('update_payment_allocation', {
            p_payment_id: pagoId,
            p_ticket_id: boletas.abonada,
            p_amount: 1_000,
            p_expected_amount: ABONO,
          }),
      ],
      [
        'update_ticket_sale_price',
        (s) =>
          s.rpc('update_ticket_sale_price', {
            p_ticket_id: boletas.sinPagar,
            p_sale_price: precioRebajado - 1_000,
            p_expected_sale_price: precioRebajado,
          }),
      ],
      [
        'reassign_ticket_client',
        (s) =>
          s.rpc('reassign_ticket_client', {
            p_ticket_id: boletas.sinPagar,
            p_expected_client_id: clienteSecreto,
            p_new_client_id: clienteSecreto,
            p_reason: 'Intento desde otra cartera',
          }),
      ],
      [
        'release_ticket_client',
        (s) =>
          s.rpc('release_ticket_client', {
            p_ticket_id: boletas.sinPagar,
            p_expected_client_id: clienteSecreto,
            p_reason: 'Intento desde otra cartera',
          }),
      ],
    ]

    for (const [nombre, llamar] of llamadas) {
      const ajeno = await llamar(seller2)
      expect(ajeno.error, `${nombre}: vendedor ajeno`).not.toBeNull()
      expect(ajeno.error!.message, nombre).toMatch(RECHAZO_DE_CARTERA)

      for (const [quien, sesion] of [
        ['Dueño', owner],
        ['Administrador', admin],
      ] as const) {
        const { error } = await llamar(sesion)
        expect(error, `${nombre}: ${quien}`).not.toBeNull()
        expect(error!.message, `${nombre}: ${quien}`).toBe(ajeno.error!.message)
      }
    }

    // Nada se movio.
    const { rows } = await db.query(
      `select id, inventory_status, client_id, sale_price, paid_amount from tickets
        where id = any($1::uuid[]) order by id`,
      [[boletas.sinPagar, boletas.abonada, boletas.disponible]],
    )
    const porId = new Map(rows.map((r) => [r.id as string, r]))
    expect(porId.get(boletas.sinPagar)).toMatchObject({
      client_id: clienteSecreto,
      paid_amount: '0',
    })
    expect(Number(porId.get(boletas.sinPagar)!.sale_price)).toBe(precioRebajado)
    expect(Number(porId.get(boletas.abonada)!.paid_amount)).toBe(ABONO)
    expect(porId.get(boletas.disponible)).toMatchObject({
      inventory_status: 'available',
      client_id: null,
    })
  })

  it('anular una boleta vendida da el mismo rechazo, lleve o no abonos (BR-Q07)', async () => {
    const mensajes = new Set<string>()

    for (const id of [boletas.sinPagar, boletas.abonada, boletas.pagada]) {
      const individual = await owner.rpc('cancel_ticket', {
        p_ticket_id: id,
        p_reason: 'Intento del personal',
      })
      expect(individual.error).not.toBeNull()
      mensajes.add(`individual: ${individual.error!.message}`)

      const lote = await owner.rpc('bulk_cancel_tickets', {
        p_ticket_ids: [id],
        p_reason: 'Intento del personal',
      })
      expect(lote.error).not.toBeNull()
      mensajes.add(`lote: ${lote.error!.message}`)
    }

    // Un mensaje para la individual y uno para el lote: los mismos para las tres.
    expect([...mensajes]).toHaveLength(2)
    expect([...mensajes].some((m) => /ya está vendida/i.test(m))).toBe(true)

    const { rows } = await db.query(
      `select count(*)::int as n from tickets
        where id = any($1::uuid[]) and inventory_status = 'assigned'`,
      [[boletas.sinPagar, boletas.abonada, boletas.pagada]],
    )
    expect(rows[0].n).toBe(3)
  })

  it('una boleta de otra organizacion responde lo mismo que una que no existe', async () => {
    const inexistente = crypto.randomUUID()

    for (const id of [boletas.abonada, inexistente]) {
      const detalle = await otherOrgOwner.rpc('admin_ticket_detail', { p_ticket_id: id })
      expect(detalle.error).toBeNull()
      expect(detalle.data).toEqual([])
    }

    const lista = await otherOrgOwner.rpc('admin_list_tickets', { p_ticket_ids: [boletas.abonada] })
    expect(lista.data).toEqual([])
    const elegibilidad = await otherOrgOwner.rpc('admin_ticket_bulk_eligibility', {
      p_ticket_ids: [boletas.abonada],
    })
    expect(elegibilidad.data).toEqual([])
    const bitacora = await otherOrgOwner.rpc('admin_audit_log', { p_entity_id: boletas.abonada })
    expect(bitacora.data).toEqual([])

    const numerosAjena = await otherOrgOwner.rpc('admin_update_ticket_numbers', {
      p_ticket_id: boletas.disponible,
      p_daily_number: '1',
      p_weekly_number: '2',
    })
    const numerosNada = await otherOrgOwner.rpc('admin_update_ticket_numbers', {
      p_ticket_id: inexistente,
      p_daily_number: '1',
      p_weekly_number: '2',
    })
    expect(numerosAjena.error).not.toBeNull()
    expect(numerosAjena.error!.message).toBe(numerosNada.error!.message)
    expect(numerosAjena.error!.message).toMatch(RECHAZO_DE_CARTERA)
  })
})

// ===========================================================================
// BR-Q03 — lo que el personal si administra sigue funcionando
// ===========================================================================

describe('BR-Q03 el inventario sigue siendo del personal', () => {
  it('cambia los numeros de una boleta, y rechaza los que no son numeros', async () => {
    let cambiado: { daily: string; weekly: string } | null = null
    for (let intento = 0; intento < 10 && cambiado === null; intento += 1) {
      const numeros = randomNumbers()
      const { error } = await owner.rpc('admin_update_ticket_numbers', {
        p_ticket_id: boletas.disponible,
        p_daily_number: numeros.daily,
        p_weekly_number: numeros.weekly,
      })
      if (!error) cambiado = numeros
      else if (!/duplicate|ya existe|tickets_combo_unique/i.test(error.message)) throw error
    }
    expect(cambiado).not.toBeNull()

    const { data } = await owner.rpc('admin_ticket_detail', { p_ticket_id: boletas.disponible })
    expect(data![0]).toMatchObject({
      daily_number: cambiado!.daily,
      weekly_number: cambiado!.weekly,
      inventory_status: 'available',
    })

    const letras = await owner.rpc('admin_update_ticket_numbers', {
      p_ticket_id: boletas.disponible,
      p_daily_number: '12A4',
      p_weekly_number: cambiado!.weekly,
    })
    expect(letras.error).not.toBeNull()
    expect(letras.error!.message).toMatch(/entre 1 y 4 dígitos/i)
  })

  it('crea una boleta sin venta con su propio id, sin poder leerla de vuelta', async () => {
    const id = crypto.randomUUID()
    let creada = false
    for (let intento = 0; intento < 10 && !creada; intento += 1) {
      const { daily, weekly } = randomNumbers()
      const { error } = await owner.from('tickets').insert({
        id,
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: ctx.ids.seller2,
        daily_number: daily,
        weekly_number: weekly,
        inventory_status: 'available',
        created_by: ctx.ids.owner,
      })
      if (!error) creada = true
      else if (error.code !== '23505') throw error
    }
    expect(creada).toBe(true)
    creadas.push(id)

    const { data } = await owner.rpc('admin_ticket_detail', { p_ticket_id: id })
    expect(data![0]).toMatchObject({
      id,
      seller_id: ctx.ids.seller2,
      inventory_status: 'available',
      payment_state: null,
    })

    // Pedir la fila de vuelta falla: el personal no tiene lectura sobre `tickets`.
    const { daily, weekly } = randomNumbers()
    const conRetorno = await owner
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: ctx.ids.seller2,
        daily_number: daily,
        weekly_number: weekly,
        inventory_status: 'available',
        created_by: ctx.ids.owner,
      })
      .select('id')
    for (const fila of conRetorno.data ?? []) creadas.push(fila.id)
    expect(conRetorno.error).not.toBeNull()
  })
})

// ===========================================================================
// BR-Q09 — avisos de venta sin precio
// ===========================================================================

describe('BR-Q09 los avisos de venta llegan al personal sin el precio', () => {
  it('las ventas de esta suite avisaron al personal, y ningun aviso suyo lleva el precio', async () => {
    const vendidas = [boletas.sinPagar, boletas.abonada, boletas.pagada]

    for (const sesion of [owner, admin]) {
      const { data, error } = await sesion
        .from('notifications')
        .select('kind, data, entity_id')
        .eq('kind', 'team.sale')
        .in('entity_id', vendidas)
      expect(error).toBeNull()
      expect(data).toHaveLength(3)
      for (const aviso of data!) expect(aviso.data).not.toHaveProperty('sale_price')
    }

    const { rows } = await db.query(`
      select count(*)::int as n
        from notifications n
        join memberships m
          on m.profile_id = n.recipient_profile_id and m.organization_id = n.organization_id
       where n.kind = 'team.sale' and m.role in ('owner', 'admin') and n.data ? 'sale_price'
    `)
    expect(rows[0].n).toBe(0)
  })

  it('ascender a un vendedor a administrador le quita el precio de los avisos que ya tenia', async () => {
    await db.query('begin')
    try {
      await db.query(
        `insert into notifications (organization_id, recipient_profile_id, kind, entity_type, entity_id, data)
         values ($1, $2, 'team.sale', 'ticket', $3, $4::jsonb)`,
        [
          ctx.demoOrg.id,
          ctx.ids.seller2,
          boletas.pagada,
          JSON.stringify({
            seller_name: 'Integrante',
            daily_number: '1',
            weekly_number: '2',
            sale_price: precioRebajado,
          }),
        ],
      )
      await db.query(
        `update memberships set role = 'admin' where profile_id = $1 and organization_id = $2`,
        [ctx.ids.seller2, ctx.demoOrg.id],
      )

      const { rows } = await db.query(
        `select data from notifications
          where recipient_profile_id = $1 and kind = 'team.sale' and entity_id = $2`,
        [ctx.ids.seller2, boletas.pagada],
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].data).not.toHaveProperty('sale_price')
      expect(rows[0].data).toMatchObject({ seller_name: 'Integrante' })
    } finally {
      await db.query('rollback')
    }
  })
})

// ===========================================================================
// Catalogo: privilegios de las piezas de D-198
// ===========================================================================

describe('catalogo de las funciones de D-198 (SECURITY §4.5, I-020, I-078)', () => {
  const PROYECCIONES = [
    'admin_audit_log',
    'admin_list_tickets',
    'admin_lottery_matches',
    'admin_ticket_bulk_eligibility',
    'admin_ticket_detail',
    'admin_ticket_inventory',
    'admin_update_ticket_numbers',
  ]

  const PRIVILEGIOS = `
    select p.proname,
           p.prosecdef,
           pg_get_userbyid(p.proowner) as dueno,
           coalesce(array_to_string(p.proconfig, ',') like '%search_path=public, pg_temp%', false) as fija_path,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anonimo,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as autenticado,
           has_function_privilege('service_role', p.oid, 'EXECUTE') as servicio,
           exists (
             select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where a.grantee = 0 and a.privilege_type = 'EXECUTE'
           ) as publico
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any ($1)
     order by p.proname`

  it('las proyecciones son SECURITY DEFINER con search_path fijo, y solo las ejecutan authenticated y service_role', async () => {
    const { rows } = await db.query(PRIVILEGIOS, [PROYECCIONES])
    expect(rows.map((r) => r.proname)).toEqual(PROYECCIONES)

    for (const row of rows) {
      expect(row.prosecdef, row.proname).toBe(true)
      expect(row.fija_path, row.proname).toBe(true)
      expect(row.dueno, row.proname).toBe('postgres')
      expect(row.anonimo, `${row.proname}: anon`).toBe(false)
      expect(row.publico, `${row.proname}: PUBLIC`).toBe(false)
      expect(row.autenticado, `${row.proname}: authenticated`).toBe(true)
      expect(row.servicio, `${row.proname}: service_role`).toBe(true)
    }
  })

  it('las piezas internas no las ejecuta ninguna sesion', async () => {
    const { rows } = await db.query(PRIVILEGIOS, [
      ['admin_audit_redact', 'memberships_redact_staff_notifications'],
    ])
    expect(rows).toHaveLength(2)

    for (const row of rows) {
      expect(row.fija_path, row.proname).toBe(true)
      expect(row.anonimo, `${row.proname}: anon`).toBe(false)
      expect(row.publico, `${row.proname}: PUBLIC`).toBe(false)
      expect(row.autenticado, `${row.proname}: authenticated`).toBe(false)
    }
  })

  it('anon no obtiene nada de las proyecciones', async () => {
    const { anonClient } = await import('./helpers')
    const { data, error } = await anonClient().rpc('admin_list_tickets', {})
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })
})

// ===========================================================================
// Regresion: el vendedor conserva su cartera
// ===========================================================================

describe('el vendedor conserva su cartera entera', () => {
  it('ve su cliente, sus boletas con precio y abonos, sus pagos y su saldo', async () => {
    const { data: cliente } = await seller1
      .from('clients')
      .select('name, phone, alias, email')
      .eq('id', clienteSecreto)
      .single()
    expect(cliente).toEqual({
      name: SECRETO.nombre,
      phone: SECRETO.telefono,
      alias: SECRETO.alias,
      email: SECRETO.correo,
    })

    const { data: tickets } = await seller1
      .from('tickets')
      .select('id, client_id, sale_price, paid_amount, payment_status')
      .in('id', [boletas.sinPagar, boletas.abonada, boletas.pagada])
    expect(tickets).toHaveLength(3)
    for (const ticket of tickets!) {
      expect(ticket.client_id).toBe(clienteSecreto)
      expect(ticket.sale_price).toBe(precioRebajado)
    }
    expect(tickets!.map((t) => t.payment_status).sort()).toEqual(['paid', 'partial', 'unpaid'])

    const { data: pagos } = await seller1
      .from('v_payment_history')
      .select('payment_id, total_amount')
      .eq('client_id', clienteSecreto)
    expect(pagos!.map((p) => Number(p.total_amount)).sort((a, b) => a - b)).toEqual([
      ABONO,
      precioRebajado,
    ])

    const { data: saldo } = await seller1
      .from('v_client_balances')
      .select('pending_amount')
      .eq('client_id', clienteSecreto)
      .single()
    expect(Number(saldo!.pending_amount)).toBe(2 * precioRebajado - ABONO)
  })

  it('y otro vendedor no ve nada de ella', async () => {
    const { data: cliente } = await seller2.from('clients').select('id').eq('id', clienteSecreto)
    expect(cliente).toEqual([])
    const { data: tickets } = await seller2.from('tickets').select('id').in('id', [boletas.abonada])
    expect(tickets).toEqual([])
  })
})
