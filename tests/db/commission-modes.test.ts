/**
 * Las DOS formas de pago (migracion 0025, BR-G13..BR-G16).
 *
 *   pertenece a un equipo   -> tramos: 1–20 $20.000 · 21–30 $25.000 · …
 *   no pertenece a ninguno  -> la MITAD del precio vigente de la rifa
 *
 * El jefe de un equipo cuenta como «no pertenece a ninguno»: el no fue creado
 * bajo nadie. Es deliberado — si al armar equipo pasara a tramos, su pago por
 * boleta caeria de la mitad del precio a los $20.000 del primer tramo, y formar
 * equipo lo castigaria.
 *
 * Lo que se comprueba aqui es dinero que se le debe a personas, asi que se
 * prueban las dos formas, el paso de una a otra, y que la invariante del ledger
 * siga cierta en todos los casos.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadSeedContext, SEED_PASSWORD, signInAs, type Client } from './helpers'

/**
 * Precio VIGENTE de la rifa del seed, leido de la base en `beforeAll`.
 *
 * No se escribe a mano a proposito (D-098): la mitad del precio ES la tarifa de
 * quien no pertenece a un equipo, asi que un numero fijado aqui convertiria
 * cualquier cambio de precio de la rifa en un fallo de esta suite que apunta al
 * sitio equivocado. Ya paso con `100_000`.
 */
let PRICE: number

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
/**
 * El Dueño registra los pagos.
 *
 * `create_payment` acepta al personal para cualquier cliente (BR-F02), y aqui
 * hacen falta tres clientes distintos: la FK compuesta `tickets_client_seller_fk`
 * exige que la boleta y su cliente sean del MISMO vendedor, asi que no se puede
 * vender la boleta de uno al cliente de otro.
 */
let owner: Client

let jefeId: string
let sueltoId: string
let integranteId: string

/** Un cliente por vendedor, por la FK compuesta. */
const clientes = new Map<string, string>()

const boletas: string[] = []
const pagos: string[] = []

async function alta(nombre: string, padre: string | null, stamp: string): Promise<string> {
  const { data, error } = await ctx.svc.auth.admin.createUser({
    email: `${nombre}-${stamp}@demo.test`,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `${nombre} ${stamp}`, phone: '3001234567' },
  })
  if (error) throw new Error(`No se pudo crear ${nombre}: ${error.message}`)

  const { error: membresiaError } = await ctx.svc.from('memberships').insert({
    organization_id: ctx.demoOrg.id,
    profile_id: data.user.id,
    role: 'seller',
    parent_seller_id: padre,
  })
  if (membresiaError) throw membresiaError

  return data.user.id
}

/**
 * Numeros ya usados EN ESTA EJECUCION, para no repetirlos entre llamadas.
 *
 * La version anterior sorteaba UNA base de dos cifras por llamada
 * (`Math.random() * 90 + 10`) y no recordaba nada. Con seis llamadas sobre
 * noventa valores posibles, la probabilidad de que dos coincidieran rondaba el
 * 15%: una de cada siete ejecuciones moria con `duplicate key value violates
 * unique constraint "tickets_combo_unique"` y arrastraba consigo las pruebas
 * siguientes —incluida la restauracion del precio de E6-04, que dejaba la rifa
 * en $120.000 y hacia fallar a la ejecucion posterior por un motivo que no
 * tenia nada que ver—. Le paso al CI del commit `8e88e81`, que era SOLO
 * documentacion (I-057, misma familia que I-055 e I-035).
 */
const numerosUsados = new Set<string>()

/** Vende `n` boletas a nombre de `sellerId`, a SU cliente, y las cobra enteras. */
async function venderYCobrar(sellerId: string, n: number): Promise<void> {
  const clienteId = clientes.get(sellerId)!
  const ids: string[] = []

  for (let i = 0; i < n; i++) {
    // El reintento cubre lo que el conjunto no puede saber: estos numeros
    // comparten espacio con los del seed y los de otras suites (BR-N04).
    let insertado: { id: string } | null = null
    let ultimoError: { code?: string | null; message?: string | null } | null = null

    for (let intento = 0; intento < 20 && insertado === null; intento++) {
      let numero = String(Math.floor(Math.random() * 9000) + 1000)
      while (numerosUsados.has(numero)) numero = String(Math.floor(Math.random() * 9000) + 1000)

      const { data, error } = await ctx.svc
        .from('tickets')
        .insert({
          organization_id: ctx.demoOrg.id,
          raffle_id: ctx.demoRaffle.id,
          seller_id: sellerId,
          created_by: ctx.ids.owner,
          daily_number: numero,
          weekly_number: numero,
          inventory_status: 'assigned',
          client_id: clienteId,
          sale_price: PRICE,
          sale_date: '2026-08-13',
          assigned_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (error) {
        ultimoError = error
        // Solo se reintenta la combinacion ocupada; cualquier otro error es un
        // fallo de verdad y debe salir a la luz de inmediato.
        if (error.code !== '23505') throw error
        continue
      }

      numerosUsados.add(numero)
      insertado = data
    }

    if (insertado === null) {
      throw new Error(`No se encontro una combinacion libre: ${ultimoError?.message}`)
    }

    ids.push(insertado.id)
    boletas.push(insertado.id)
  }

  const { data: pagoId, error: pagoError } = await owner.rpc('create_payment', {
    p_client_id: clienteId,
    p_total_amount: ids.length * PRICE,
    p_allocations: ids.map((id) => ({ ticket_id: id, amount: PRICE })),
    p_payment_date: '2026-08-13',
    p_payment_method: 'cash',
  })
  if (pagoError) throw new Error(`No se pudo cobrar: ${pagoError.message}`)
  if (pagoId) pagos.push(pagoId)
}

async function comisionDe(profileId: string) {
  const { data, error } = await ctx.svc
    .from('seller_commissions')
    .select('tickets_paid, rate, earned')
    .eq('seller_id', profileId)
    .eq('raffle_id', ctx.demoRaffle.id)
    .maybeSingle()
  if (error) throw error
  return data ?? { tickets_paid: 0, rate: 0, earned: 0 }
}

/** La invariante de siempre: el ledger explica exactamente el saldo (BR-G10). */
async function expectLedgerMatches(profileId: string): Promise<void> {
  const { data } = await ctx.svc
    .from('commission_ledger')
    .select('amount')
    .eq('seller_id', profileId)
    .eq('raffle_id', ctx.demoRaffle.id)

  const suma = (data ?? []).reduce((total, fila) => total + Number(fila.amount), 0)
  const estado = await comisionDe(profileId)
  expect(suma, 'el ledger debe explicar exactamente el saldo').toBe(Number(estado.earned))
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  owner = await signInAs('owner@demo.test')

  const { data: rifa, error: rifaError } = await ctx.svc
    .from('raffles')
    .select('ticket_price')
    .eq('id', ctx.demoRaffle.id)
    .single()
  if (rifaError) throw rifaError
  PRICE = Number(rifa.ticket_price)

  const stamp = Date.now().toString(36)
  jefeId = await alta('jefe', null, stamp)
  sueltoId = await alta('suelto', null, stamp)
  integranteId = await alta('integrante', jefeId, stamp)

  for (const [nombre, id] of [
    ['jefe', jefeId],
    ['suelto', sueltoId],
    ['integrante', integranteId],
  ] as const) {
    const { data: cliente, error } = await ctx.svc
      .from('clients')
      .insert({
        organization_id: ctx.demoOrg.id,
        seller_id: id,
        name: `Cliente de ${nombre} ${stamp}`,
        phone: '3005557777',
      })
      .select('id')
      .single()
    if (error) throw error
    clientes.set(id, cliente.id)
  }
}, 60_000)

afterAll(async () => {
  const ids = [jefeId, sueltoId, integranteId]

  if (pagos.length > 0) {
    await ctx.svc.from('payment_allocations').delete().in('payment_id', pagos)
    await ctx.svc.from('payments').delete().in('id', pagos)
  }
  if (boletas.length > 0) {
    await ctx.svc.from('notifications').delete().in('entity_id', boletas)
    await ctx.svc.from('tickets').delete().in('id', boletas)
  }
  await ctx.svc.from('commission_ledger').delete().in('seller_id', ids)
  await ctx.svc.from('seller_commissions').delete().in('seller_id', ids)
  await ctx.svc
    .from('clients')
    .delete()
    .in('id', [...clientes.values()])
  await ctx.svc.from('notifications').delete().in('recipient_profile_id', ids)

  // El integrante primero: la FK del vendedor padre es `on delete restrict`.
  await ctx.svc.from('memberships').delete().eq('profile_id', integranteId)
  await ctx.svc.from('memberships').delete().in('profile_id', [jefeId, sueltoId])
  for (const id of ids) await ctx.svc.auth.admin.deleteUser(id)
}, 60_000)

describe('E6 — dos formas de pago', () => {
  it('E6-01: sin equipo gana la MITAD del precio, no el primer tramo', async () => {
    await venderYCobrar(sueltoId, 3)

    const estado = await comisionDe(sueltoId)
    expect(Number(estado.tickets_paid)).toBe(3)
    // La mitad del precio de la rifa, no los $20.000 del primer tramo.
    expect(Number(estado.rate)).toBe(PRICE / 2)
    expect(Number(estado.earned)).toBe(3 * (PRICE / 2))
    await expectLedgerMatches(sueltoId)
  })

  it('E6-02: el JEFE de un equipo también cobra la mitad', async () => {
    await venderYCobrar(jefeId, 2)

    const estado = await comisionDe(jefeId)
    expect(Number(estado.rate)).toBe(PRICE / 2)
    expect(Number(estado.earned)).toBe(2 * (PRICE / 2))
    await expectLedgerMatches(jefeId)
  })

  it('E6-03: el integrante de un equipo cobra por TRAMOS', async () => {
    await venderYCobrar(integranteId, 3)

    const estado = await comisionDe(integranteId)
    expect(Number(estado.tickets_paid)).toBe(3)
    expect(Number(estado.rate)).toBe(20_000)
    expect(Number(estado.earned)).toBe(60_000)
    await expectLedgerMatches(integranteId)
  })

  it('E6-04: cambiar el precio de la rifa recalcula a quien cobra la mitad', async () => {
    // La comision usa el precio VIGENTE, no el congelado en la boleta: subirlo
    // cambia lo que se debe por ventas ya cobradas (decisión del dueño).
    const subido = PRICE + 20_000
    await ctx.svc.from('raffles').update({ ticket_price: subido }).eq('id', ctx.demoRaffle.id)

    const suelto = await comisionDe(sueltoId)
    expect(Number(suelto.rate)).toBe(subido / 2)
    expect(Number(suelto.earned)).toBe(3 * (subido / 2))
    await expectLedgerMatches(sueltoId)

    // Y NO toca a quien cobra por tramos: su tarifa no depende del precio.
    const integrante = await comisionDe(integranteId)
    expect(Number(integrante.rate)).toBe(20_000)
    expect(Number(integrante.earned)).toBe(60_000)

    await ctx.svc.from('raffles').update({ ticket_price: PRICE }).eq('id', ctx.demoRaffle.id)
  })

  it('E6-05: entrar y salir de un equipo cambia la forma de pago, retroactiva', async () => {
    await ctx.svc
      .from('memberships')
      .update({ parent_seller_id: jefeId })
      .eq('profile_id', sueltoId)

    const dentro = await comisionDe(sueltoId)
    expect(Number(dentro.rate)).toBe(20_000)
    expect(Number(dentro.earned)).toBe(3 * 20_000)
    await expectLedgerMatches(sueltoId)

    await ctx.svc.from('memberships').update({ parent_seller_id: null }).eq('profile_id', sueltoId)

    const fuera = await comisionDe(sueltoId)
    expect(Number(fuera.rate)).toBe(PRICE / 2)
    expect(Number(fuera.earned)).toBe(3 * (PRICE / 2))
    await expectLedgerMatches(sueltoId)
  })

  it('E6-06: `commission_summary` dice con qué regla se le paga a cada quien', async () => {
    // Con la SESION del Dueño: la funcion es `security invoker` y hereda la RLS
    // de `seller_commissions`. Llamarla con la clave de servicio no probaria lo
    // que ve una persona de verdad.
    const { data, error } = await owner.rpc('commission_summary', {
      p_raffle_id: ctx.demoRaffle.id,
    })
    expect(error).toBeNull()

    const suelto = data?.find((fila) => fila.seller_id === sueltoId)
    const integrante = data?.find((fila) => fila.seller_id === integranteId)

    expect(suelto!.by_tiers).toBe(false)
    // Quien cobra la mitad no tiene «próximo nivel»: no hay niveles que subir.
    expect(suelto!.next_min_tickets).toBeNull()
    expect(suelto!.tickets_to_next).toBeNull()

    expect(integrante!.by_tiers).toBe(true)
    expect(integrante!.next_min_tickets).toBe(21)
  })
})
