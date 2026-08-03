/**
 * Pruebas obligatorias 1 a 6 y 12 del prompt de la Fase 2: numeracion de
 * boletas y restricciones de estado.
 *
 * Reglas cubiertas: BR-N01..BR-N09, BR-I01..BR-I06.
 */
import { beforeAll, describe, expect, it } from 'vitest'

import { insertTicket, loadSeedContext, randomNumbers, type Client } from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let svc: Client

beforeAll(async () => {
  ctx = await loadSeedContext()
  svc = ctx.svc
})

describe('DB-01/02 unicidad de la combinacion dentro de una rifa', () => {
  it('rechaza la misma combinacion dos veces en la misma rifa (BR-N04)', async () => {
    const { daily, weekly } = randomNumbers()
    const base = {
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
    }

    const first = await insertTicket(svc, base)
    expect(first.error).toBeNull()

    const second = await insertTicket(svc, base)
    expect(second.error).not.toBeNull()
    expect(second.error!.code).toBe('23505') // unique_violation
  })

  it('rechaza el duplicado aunque sea de OTRO vendedor (BR-N05)', async () => {
    const { daily, weekly } = randomNumbers()

    const first = await insertTicket(svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
    })
    expect(first.error).toBeNull()

    // Mismo par de numeros, vendedor distinto: la restriccion NO incluye
    // seller_id justamente para que esto sea imposible.
    const second = await insertTicket(svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller2,
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
    })
    expect(second.error).not.toBeNull()
    expect(second.error!.code).toBe('23505')
  })

  it('rechaza reutilizar la combinacion de una boleta ANULADA (BR-N08)', async () => {
    const { daily, weekly } = randomNumbers()
    const created = await insertTicket(svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
    })
    expect(created.error).toBeNull()

    await svc
      .from('tickets')
      .update({ inventory_status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', created.data!.id)

    const reused = await insertTicket(svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
    })
    expect(reused.error).not.toBeNull()
    expect(reused.error!.code).toBe('23505')
  })
})

describe('DB-03 la misma combinacion SI puede existir en otra rifa (BR-N06)', () => {
  it('el seed ya contiene combinaciones repetidas entre las dos rifas', async () => {
    const { data } = await svc
      .from('tickets')
      .select('daily_number, weekly_number, raffle_id')
      .eq('daily_number', '1234')
      .eq('weekly_number', '5678')

    expect(data!.length).toBe(2)
    const raffleIds = new Set(data!.map((t) => t.raffle_id))
    expect(raffleIds.size).toBe(2)
  })

  it('acepta insertar en la rifa de control una combinacion que ya existe en la demo', async () => {
    const { daily, weekly } = randomNumbers()

    const inDemo = await insertTicket(svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
    })
    expect(inDemo.error).toBeNull()

    const inControl = await insertTicket(svc, {
      organization_id: ctx.controlOrg.id,
      raffle_id: ctx.controlRaffle.id,
      seller_id: ctx.ids.otherOrgSeller,
      created_by: ctx.ids.otherOrgSeller,
      daily_number: daily,
      weekly_number: weekly,
    })
    expect(inControl.error).toBeNull()
  })
})

describe('DB-04/05 formato de los numeros (BR-N02)', () => {
  const invalid: Array<[string, string]> = [
    ['12345', 'cinco digitos'],
    ['12A4', 'caracter no numerico'],
    ['-123', 'signo negativo'],
    ['12.5', 'separador decimal'],
    ['', 'cadena vacia'],
    [' 123', 'espacio inicial'],
  ]

  for (const [value, description] of invalid) {
    it(`rechaza "${value}" (${description})`, async () => {
      const result = await insertTicket(svc, {
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: ctx.ids.seller1,
        created_by: ctx.ids.owner,
        daily_number: value,
        weekly_number: '1111',
      })
      expect(result.error).not.toBeNull()
      expect(result.error!.code).toBe('23514') // check_violation
    })
  }

  const valid = ['1', '25', '007', '0000', '9999']
  for (const value of valid) {
    it(`acepta "${value}"`, async () => {
      const { weekly } = randomNumbers()
      const result = await insertTicket(svc, {
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: ctx.ids.seller1,
        created_by: ctx.ids.owner,
        daily_number: value,
        weekly_number: weekly,
      })
      expect(result.error).toBeNull()
    })
  }
})

describe('DB-06 conservacion de ceros iniciales (BR-N03)', () => {
  it('devuelve el valor EXACTO que se guardo, sin normalizar', async () => {
    const { weekly } = randomNumbers()
    const created = await insertTicket(svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: '0042',
      weekly_number: weekly,
    })
    expect(created.error).toBeNull()

    const { data } = await svc
      .from('tickets')
      .select('daily_number')
      .eq('id', created.data!.id)
      .single()

    expect(data!.daily_number).toBe('0042')
    expect(data!.daily_number).not.toBe('42')
  })

  it('"007" y "7" son combinaciones DISTINTAS y pueden coexistir (BR-N07)', async () => {
    const { data } = await svc
      .from('tickets')
      .select('daily_number, weekly_number')
      .eq('raffle_id', ctx.demoRaffle.id)
      .in('daily_number', ['007', '7'])

    const dailies = data!.map((t) => t.daily_number).sort()
    expect(dailies).toContain('007')
    expect(dailies).toContain('7')
  })
})

describe('DB-12 restricciones de estado (BR-I01..BR-I06)', () => {
  it('rechaza una boleta fuera de draft sin numeros (BR-N09)', async () => {
    const result = await insertTicket(svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: null,
      weekly_number: null,
      inventory_status: 'available',
    })
    expect(result.error).not.toBeNull()
    expect(result.error!.code).toBe('23514')
  })

  it('acepta una boleta en draft SIN numeros (D-017, guardado parcial)', async () => {
    const result = await insertTicket(svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: null,
      weekly_number: null,
      inventory_status: 'draft',
    })
    expect(result.error).toBeNull()
  })

  it('rechaza una boleta "available" que tenga cliente (BR-I04)', async () => {
    const { daily, weekly } = randomNumbers()
    const { error } = await svc.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
      inventory_status: 'available',
      client_id: ctx.clients.ana.id,
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23514')
  })

  it('rechaza "assigned" sin precio ni fecha de venta (BR-I05)', async () => {
    const { daily, weekly } = randomNumbers()
    const { error } = await svc.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
      inventory_status: 'assigned',
      client_id: ctx.clients.ana.id,
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23514')
  })

  it('rechaza una transicion invalida: cancelled -> available (maquina de estados)', async () => {
    const { daily, weekly } = randomNumbers()
    const created = await insertTicket(svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
    })
    await svc
      .from('tickets')
      .update({ inventory_status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', created.data!.id)

    const { error } = await svc
      .from('tickets')
      .update({ inventory_status: 'available' })
      .eq('id', created.data!.id)

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/Transicion de estado no permitida/i)
  })

  it('rechaza una boleta cuyo vendedor no tiene rol seller (D-021)', async () => {
    const { daily, weekly } = randomNumbers()
    const result = await insertTicket(svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.admin, // es admin, no vendedor
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
    })
    expect(result.error).not.toBeNull()
    expect(result.error!.message).toMatch(/no es un vendedor activo/i)
  })
})
