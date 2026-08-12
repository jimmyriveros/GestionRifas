/**
 * Comisiones por tramos (migracion 0024, BR-G01..BR-G12).
 *
 * Es la suite que toca dinero, asi que comprueba los umbrales exactos que pidio
 * el encargo —0, 1, 20, 21, 30, 31, 50, 51— **y las bajadas**, que son las que
 * de verdad se equivocan: 21→20, 31→30, 51→50.
 *
 * Ademas de los importes, cada escenario comprueba la invariante del ledger:
 *
 *     sum(commission_ledger.amount) = seller_commissions.earned
 *
 * Si esa igualdad se rompe, el historial dejo de explicar el saldo y da igual
 * que el numero de arriba parezca correcto.
 *
 * El escenario se prepara con la service role (boletas y clientes), pero los
 * PAGOS se registran con la sesion real del vendedor llamando a `create_payment`,
 * que es el mismo camino que usa la aplicacion.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadSeedContext, SEED_PASSWORD, signInAs, type Client } from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let sellerId: string
let seller: Client
let clientId: string

/** Las 60 boletas del escenario, ya vendidas y sin pagar. */
const ticketIds: string[] = []
/** Cuantas llevamos pagadas: las pruebas avanzan sobre este contador. */
let paidCount = 0
/** Prefijo unico de esta ejecucion: todas las boletas de la suite salen de aqui. */
let numberBase = 0

const PRICE = 100_000

async function setupSeller(): Promise<void> {
  const email = `comision-${Date.now().toString(36)}@demo.test`

  const { data, error } = await ctx.svc.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Vendedor Comision', phone: '3001234567' },
  })
  if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`)
  sellerId = data.user.id

  await ctx.svc.auth.admin.updateUserById(sellerId, { password: SEED_PASSWORD })
  await ctx.svc.from('memberships').insert({
    organization_id: ctx.demoOrg.id,
    profile_id: sellerId,
    role: 'seller',
  })

  seller = await signInAs(email)

  const { data: cliente, error: clientError } = await ctx.svc
    .from('clients')
    .insert({
      organization_id: ctx.demoOrg.id,
      seller_id: sellerId,
      name: 'Cliente de comisiones',
      phone: '3009990000',
    })
    .select('id')
    .single()
  if (clientError) throw clientError
  clientId = cliente.id
}

/**
 * 60 boletas vendidas al mismo cliente y sin pagar.
 *
 * Los numeros se generan sin azar, a partir de un prefijo unico por ejecucion:
 * una colision con otra prueba haria fallar el lote entero por la restriccion
 * de combinacion (BR-N04), y buscar boletas por un solo numero puede tropezar
 * con las de otra suite (I-055).
 */
async function createSoldTickets(): Promise<void> {
  numberBase = Math.floor(Math.random() * 90) + 10 // 10..99
  const base = numberBase
  const rows = Array.from({ length: 60 }, (_, i) => ({
    organization_id: ctx.demoOrg.id,
    raffle_id: ctx.demoRaffle.id,
    seller_id: sellerId,
    created_by: ctx.ids.owner,
    daily_number: `${base}${String(i).padStart(2, '0')}`,
    weekly_number: `${base}${String(i).padStart(2, '0')}`,
    inventory_status: 'assigned' as const,
    client_id: clientId,
    sale_price: PRICE,
    sale_date: '2026-08-12',
    assigned_at: new Date().toISOString(),
  }))

  const { data, error } = await ctx.svc.from('tickets').insert(rows).select('id')
  if (error) throw error
  ticketIds.push(...data.map((row) => row.id))
}

/** Paga por completo las siguientes `n` boletas, con la sesion del vendedor. */
async function payMore(n: number): Promise<void> {
  const target = ticketIds.slice(paidCount, paidCount + n)
  const { error } = await seller.rpc('create_payment', {
    p_client_id: clientId,
    p_total_amount: target.length * PRICE,
    p_allocations: target.map((id) => ({ ticket_id: id, amount: PRICE })),
    p_payment_date: '2026-08-12',
    p_payment_method: 'cash',
  })
  if (error) throw new Error(`No se pudo pagar: ${error.message}`)
  paidCount += target.length
}

/** Anula el ultimo pago registrado: baja el recuento de boletas pagadas. */
async function voidLastPayment(): Promise<number> {
  const { data, error } = await ctx.svc
    .from('payments')
    .select('id, payment_allocations ( ticket_id )')
    .eq('client_id', clientId)
    .is('voided_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (error) throw error

  const owner = await signInAs('owner@demo.test')
  const { error: voidError } = await owner.rpc('void_payment', {
    p_payment_id: data.id,
    p_reason: 'Prueba de bajada de tramo',
  })
  if (voidError) throw new Error(`No se pudo anular: ${voidError.message}`)

  const revertidas = data.payment_allocations.length
  paidCount -= revertidas
  return revertidas
}

async function commissionOf(profileId = sellerId) {
  const { data, error } = await ctx.svc
    .from('seller_commissions')
    .select('tickets_paid, rate, earned')
    .eq('seller_id', profileId)
    .eq('raffle_id', ctx.demoRaffle.id)
    .maybeSingle()
  if (error) throw error
  return data ?? { tickets_paid: 0, rate: 0, earned: 0 }
}

/** La invariante del ledger, comprobada en cada escenario. */
async function expectLedgerMatches(profileId = sellerId): Promise<void> {
  const { data, error } = await ctx.svc
    .from('commission_ledger')
    .select('amount')
    .eq('seller_id', profileId)
    .eq('raffle_id', ctx.demoRaffle.id)
  if (error) throw error

  const suma = (data ?? []).reduce((total, row) => total + Number(row.amount), 0)
  const estado = await commissionOf(profileId)
  expect(suma, 'el ledger debe explicar exactamente el saldo').toBe(Number(estado.earned))
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  await setupSeller()
  await createSoldTickets()
}, 60_000)

afterAll(async () => {
  // Orden obligatorio por las FK: pagos -> boletas -> comisiones -> cliente ->
  // membresia -> cuenta.
  const { data: pagos } = await ctx.svc.from('payments').select('id').eq('client_id', clientId)
  const pagoIds = (pagos ?? []).map((row) => row.id)
  if (pagoIds.length > 0) {
    await ctx.svc.from('payment_allocations').delete().in('payment_id', pagoIds)
    await ctx.svc.from('payments').delete().in('id', pagoIds)
  }
  if (ticketIds.length > 0) {
    await ctx.svc.from('notifications').delete().in('entity_id', ticketIds)
    await ctx.svc.from('tickets').delete().in('id', ticketIds)
  }
  await ctx.svc.from('commission_ledger').delete().eq('seller_id', sellerId)
  await ctx.svc.from('seller_commissions').delete().eq('seller_id', sellerId)
  await ctx.svc.from('clients').delete().eq('id', clientId)
  await ctx.svc.from('notifications').delete().eq('recipient_profile_id', sellerId)
  await ctx.svc.from('memberships').delete().eq('profile_id', sellerId)
  await ctx.svc.auth.admin.deleteUser(sellerId)
}, 60_000)

describe('E5 — los tramos, uno por uno', () => {
  it('E5-01: sin boletas pagadas no hay comision', async () => {
    const estado = await commissionOf()
    expect(Number(estado.tickets_paid)).toBe(0)
    expect(Number(estado.earned)).toBe(0)
  })

  it('E5-02: 1 boleta = 1 × $20.000', async () => {
    await payMore(1)
    const estado = await commissionOf()

    expect(Number(estado.tickets_paid)).toBe(1)
    expect(Number(estado.rate)).toBe(20_000)
    expect(Number(estado.earned)).toBe(20_000)
    await expectLedgerMatches()
  })

  it('E5-03: 20 boletas = 20 × $20.000 = $400.000 (limite del primer tramo)', async () => {
    await payMore(19)
    const estado = await commissionOf()

    expect(Number(estado.tickets_paid)).toBe(20)
    expect(Number(estado.rate)).toBe(20_000)
    expect(Number(estado.earned)).toBe(400_000)
    await expectLedgerMatches()
  })

  it('E5-04: 21 boletas = 21 × $25.000 = $525.000, y el salto son +$125.000', async () => {
    // El ejemplo exacto del encargo: la venta nueva aporta $25.000 y el ajuste
    // retroactivo sobre las 20 anteriores, 20 × $5.000 = $100.000.
    await payMore(1)
    const estado = await commissionOf()

    expect(Number(estado.tickets_paid)).toBe(21)
    expect(Number(estado.rate)).toBe(25_000)
    expect(Number(estado.earned)).toBe(525_000)
    await expectLedgerMatches()

    const { data } = await ctx.svc
      .from('commission_ledger')
      .select('movement, amount')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false })
      .limit(2)

    const porTipo = new Map((data ?? []).map((row) => [row.movement, Number(row.amount)]))
    expect(porTipo.get('sale')).toBe(25_000)
    expect(porTipo.get('tier_adjustment')).toBe(100_000)
  })

  it('E5-05: 30 boletas = 30 × $25.000 = $750.000', async () => {
    await payMore(9)
    const estado = await commissionOf()

    expect(Number(estado.tickets_paid)).toBe(30)
    expect(Number(estado.earned)).toBe(750_000)
    await expectLedgerMatches()
  })

  it('E5-06: 31 boletas = 31 × $30.000 = $930.000', async () => {
    await payMore(1)
    const estado = await commissionOf()

    expect(Number(estado.tickets_paid)).toBe(31)
    expect(Number(estado.rate)).toBe(30_000)
    expect(Number(estado.earned)).toBe(930_000)
    await expectLedgerMatches()
  })

  it('E5-07: 50 boletas = 50 × $30.000 = $1.500.000', async () => {
    await payMore(19)
    const estado = await commissionOf()

    expect(Number(estado.tickets_paid)).toBe(50)
    expect(Number(estado.earned)).toBe(1_500_000)
    await expectLedgerMatches()
  })

  it('E5-08: 51 boletas = 51 × $40.000 = $2.040.000', async () => {
    await payMore(1)
    const estado = await commissionOf()

    expect(Number(estado.tickets_paid)).toBe(51)
    expect(Number(estado.rate)).toBe(40_000)
    expect(Number(estado.earned)).toBe(2_040_000)
    await expectLedgerMatches()
  })
})

describe('E5 — las bajadas, que son las que se equivocan', () => {
  it('E5-09: 51 → 50 al anular un pago vuelve a $1.500.000', async () => {
    await voidLastPayment()
    const estado = await commissionOf()

    expect(Number(estado.tickets_paid)).toBe(50)
    expect(Number(estado.rate)).toBe(30_000)
    expect(Number(estado.earned)).toBe(1_500_000)
    await expectLedgerMatches()
  })

  it('E5-10: 31 → 30 baja el tramo y ajusta hacia atras', async () => {
    // Se anulan los pagos hasta quedar en 30.
    while (paidCount > 30) await voidLastPayment()

    const estado = await commissionOf()
    expect(Number(estado.tickets_paid)).toBe(30)
    expect(Number(estado.rate)).toBe(25_000)
    expect(Number(estado.earned)).toBe(750_000)
    await expectLedgerMatches()
  })

  it('E5-11: 21 → 20 vuelve al primer tramo, $400.000', async () => {
    while (paidCount > 20) await voidLastPayment()

    const estado = await commissionOf()
    expect(Number(estado.tickets_paid)).toBe(20)
    expect(Number(estado.rate)).toBe(20_000)
    expect(Number(estado.earned)).toBe(400_000)
    await expectLedgerMatches()
  })

  it('E5-12: el ledger conserva TODOS los movimientos, tambien los negativos', async () => {
    const { data } = await ctx.svc
      .from('commission_ledger')
      .select('movement, amount')
      .eq('seller_id', sellerId)

    const negativos = (data ?? []).filter((row) => Number(row.amount) < 0)
    expect(negativos.length).toBeGreaterThan(0)

    // Nada se borro ni se reescribio: la historia sigue completa y cuadrando.
    await expectLedgerMatches()
  })
})

describe('E5 — no existe la doble comision', () => {
  it('E5-13: repetir el mismo recalculo no escribe nada nuevo', async () => {
    const { count: antes } = await ctx.svc
      .from('commission_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', sellerId)

    // Diez recalculos seguidos, como si el evento llegara repetido.
    for (let i = 0; i < 10; i++) {
      const { error } = await ctx.svc.rpc('recalc_seller_commission', {
        p_organization_id: ctx.demoOrg.id,
        p_raffle_id: ctx.demoRaffle.id,
        p_seller_id: sellerId,
      })
      if (error) throw error
    }

    const { count: despues } = await ctx.svc
      .from('commission_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', sellerId)

    expect(despues).toBe(antes)
    const estado = await commissionOf()
    expect(Number(estado.earned)).toBe(400_000)
    await expectLedgerMatches()
  })

  it('E5-14: pagar varias boletas en una sola operacion cuenta cada una una vez', async () => {
    const antes = (await commissionOf()).tickets_paid

    await payMore(5)

    // 25 pagadas: ya es el segundo tramo, asi que son 25 × $25.000 y no
    // 25 × $20.000. La comision es retroactiva sobre TODAS (BR-G02).
    const estado = await commissionOf()
    expect(Number(estado.tickets_paid)).toBe(Number(antes) + 5)
    expect(Number(estado.rate)).toBe(25_000)
    expect(Number(estado.earned)).toBe(25 * 25_000)
    await expectLedgerMatches()
  })
})

describe('E5 — reasignacion de una boleta vendida', () => {
  /**
   * El encargo pedia recalcular las comisiones de los dos vendedores al mover
   * una boleta vendida. **Ese movimiento no existe, y no por una regla que se
   * pueda relajar: es imposible por el esquema.**
   *
   * `tickets_client_seller_fk` es una FK COMPUESTA `(client_id, seller_id) →
   * clients (id, seller_id)` y no es diferible. Una boleta vendida siempre
   * tiene cliente, y el cliente pertenece a su vendedor (BR-C05), asi que:
   *
   *   * mover la boleta rompe la FK, porque el cliente sigue siendo del otro;
   *   * mover el cliente primero rompe la FK de TODAS sus boletas;
   *   * y al no ser diferible, tampoco se pueden hacer las dos cosas dentro de
   *     una transaccion.
   *
   * Se comprueba aqui, con la service role —que omite RLS y las funciones de
   * negocio—, porque es la unica forma de demostrar que ni siquiera saltandose
   * la aplicacion se puede. La rama `seller_change` del motor se conserva: cubre
   * el cambio de vendedor de boletas SIN vender (que no cuentan, BR-B04) y deja
   * el motor listo si algun dia el negocio decide permitir el traslado completo
   * de una cartera.
   */
  it('E5-18: la base de datos impide mover una boleta vendida, y las comisiones no se mueven', async () => {
    const destinoEmail = `destino-${Date.now().toString(36)}@demo.test`
    const { data: creado } = await ctx.svc.auth.admin.createUser({
      email: destinoEmail,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Vendedor Destino', phone: '3001112222' },
    })
    const destinoId = creado!.user!.id
    await ctx.svc.from('memberships').insert({
      organization_id: ctx.demoOrg.id,
      profile_id: destinoId,
      role: 'seller',
    })

    const origenAntes = await commissionOf()
    const boleta = ticketIds[0]!

    const { error } = await ctx.svc
      .from('tickets')
      .update({ seller_id: destinoId })
      .eq('id', boleta)

    expect(error, 'mover una boleta vendida debe ser rechazado').not.toBeNull()
    expect(error!.message).toMatch(/tickets_client_seller_fk|foreign key/i)

    // Y nada se movio: ni el recuento del origen ni el saldo de nadie.
    const origenDespues = await commissionOf()
    expect(Number(origenDespues.tickets_paid)).toBe(Number(origenAntes.tickets_paid))
    expect(Number(origenDespues.earned)).toBe(Number(origenAntes.earned))
    expect(Number((await commissionOf(destinoId)).earned)).toBe(0)
    await expectLedgerMatches()

    await ctx.svc.from('seller_commissions').delete().eq('seller_id', destinoId)
    await ctx.svc.from('memberships').delete().eq('profile_id', destinoId)
    await ctx.svc.auth.admin.deleteUser(destinoId)
  })

  it('E5-19: cambiar de vendedor una boleta SIN vender no mueve ninguna comision', async () => {
    // El camino que si existe (BR-B04): una boleta disponible cambia de dueño y
    // no altera nada, porque una boleta sin pagar no cuenta para la comision.
    const antes = await commissionOf()

    const { data: libre, error: insertError } = await ctx.svc
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: sellerId,
        created_by: ctx.ids.owner,
        // Del mismo prefijo unico que las otras 60, no un numero fijo: dos
        // ejecuciones seguidas chocarian contra `tickets_combo_unique` (I-055).
        daily_number: `${numberBase}99`,
        weekly_number: `${numberBase}99`,
        inventory_status: 'available',
      })
      .select('id')
      .single()
    if (insertError) throw insertError
    ticketIds.push(libre.id)

    const { error } = await ctx.svc
      .from('tickets')
      .update({ seller_id: ctx.ids.seller2 })
      .eq('id', libre.id)

    expect(error).toBeNull()

    const despues = await commissionOf()
    expect(Number(despues.tickets_paid)).toBe(Number(antes.tickets_paid))
    expect(Number(despues.earned)).toBe(Number(antes.earned))
    await expectLedgerMatches()
  })
})

describe('E5 — el vendedor no puede tocar su comision', () => {
  it('E5-15: no puede escribir, actualizar ni borrar su saldo', async () => {
    const escrituras = [
      seller.from('seller_commissions').update({ earned: 99_999_999 }).eq('seller_id', sellerId),
      seller.from('commission_ledger').insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: sellerId,
        movement: 'sale',
        amount: 99_999_999,
        tickets_paid: 999,
        rate: 99_999,
      }),
      seller.from('commission_tiers').update({ rate: 99_999 }).eq('min_tickets', 1),
    ]

    for (const escritura of escrituras) {
      const { error } = await escritura
      expect(error).not.toBeNull()
      expect(error!.code).toBe('42501')
    }

    const estado = await commissionOf()
    expect(Number(estado.earned)).toBe(25 * 25_000)
  })

  it('E5-16: ve su propia comision y la calcula el servidor, no el navegador', async () => {
    const { data, error } = await seller.rpc('commission_summary', {
      p_raffle_id: ctx.demoRaffle.id,
    })

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]!.seller_id).toBe(sellerId)
    expect(Number(data![0]!.earned)).toBe(625_000)
    // 25 pagadas: el proximo tramo son 31 boletas a $30.000.
    expect(data![0]!.next_min_tickets).toBe(31)
    expect(Number(data![0]!.next_rate)).toBe(30_000)
    expect(data![0]!.tickets_to_next).toBe(6)
    expect(Number(data![0]!.projected_earned)).toBe(930_000)
  })

  it('E5-17: no ve la comision de un vendedor ajeno', async () => {
    const { data } = await seller.rpc('commission_summary')
    const ajenas = (data ?? []).filter((row) => row.seller_id !== sellerId)

    expect(ajenas).toHaveLength(0)
  })
})
