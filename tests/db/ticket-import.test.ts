import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { anonClient, loadSeedContext, serviceClient, signInAs, USERS, type Client } from './helpers'

/**
 * Importacion de boletas: las dos piezas de servidor de la migracion 0019
 * (BR-N12, D-081).
 *
 * Lo que se prueba aqui no se puede probar en el navegador ni con funciones
 * puras: que un VENDEDOR se entere de que una combinacion esta tomada sin poder
 * ver de quien es, y que la bitacora de la importacion no se pueda escribir a
 * nombre de otro.
 *
 * Como en todo el proyecto, con sesiones reales y clave publica: una prueba de
 * permisos que use `service_role` no prueba nada (docs/TESTING.md 2).
 */

let seed: Awaited<ReturnType<typeof loadSeedContext>>
let owner: Client
let seller1: Client
let seller2: Client
let otraOrg: Client

/** Boletas creadas por esta suite. Se borran al terminar (I-035). */
const creadas: string[] = []

/** Numeros aleatorios de 4 digitos, para no chocar entre ejecuciones. */
function numeros() {
  const n = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return { daily: n(), weekly: n() }
}

async function crearBoleta(sellerId: string, daily: string, weekly: string) {
  const { data, error } = await seed.svc
    .from('tickets')
    .insert({
      organization_id: seed.demoOrg.id,
      raffle_id: seed.demoRaffle.id,
      seller_id: sellerId,
      created_by: sellerId,
      daily_number: daily,
      weekly_number: weekly,
      inventory_status: 'available',
    })
    .select('id')
    .single()

  if (error) throw error
  creadas.push(data.id)
  return data.id
}

beforeAll(async () => {
  seed = await loadSeedContext()
  ;[owner, seller1, seller2, otraOrg] = await Promise.all([
    signInAs(USERS.owner),
    signInAs(USERS.seller1),
    signInAs(USERS.seller2),
    signInAs(USERS.otherOrgOwner),
  ])
})

afterAll(async () => {
  if (creadas.length > 0) {
    await serviceClient().from('tickets').delete().in('id', creadas)
  }
})

const combo = (daily: string, weekly: string) => ({ daily_number: daily, weekly_number: weekly })

describe('taken_ticket_combinations', () => {
  it('devuelve solo las combinaciones que ya existen, no todas las preguntadas', async () => {
    const tomada = numeros()
    const libre = numeros()
    await crearBoleta(seed.ids.seller1, tomada.daily, tomada.weekly)

    const { data, error } = await owner.rpc('taken_ticket_combinations', {
      p_raffle_id: seed.demoRaffle.id,
      p_combos: [combo(tomada.daily, tomada.weekly), combo(libre.daily, libre.weekly)],
    })

    expect(error).toBeNull()
    expect(data).toEqual([{ daily_number: tomada.daily, weekly_number: tomada.weekly }])
  })

  it('CASO 16 — un vendedor SI se entera de que la combinacion es de otro vendedor', async () => {
    // La boleta es de vendedor2; quien pregunta es vendedor1.
    const ajena = numeros()
    await crearBoleta(seed.ids.seller2, ajena.daily, ajena.weekly)

    const { data, error } = await seller1.rpc('taken_ticket_combinations', {
      p_raffle_id: seed.demoRaffle.id,
      p_combos: [combo(ajena.daily, ajena.weekly)],
    })

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('pero NO puede ver esa boleta ni saber de quien es', async () => {
    const ajena = numeros()
    const ticketId = await crearBoleta(seed.ids.seller2, ajena.daily, ajena.weekly)

    // Lo que devuelve la funcion son dos columnas y ninguna dice de quien es.
    const { data } = await seller1.rpc('taken_ticket_combinations', {
      p_raffle_id: seed.demoRaffle.id,
      p_combos: [combo(ajena.daily, ajena.weekly)],
    })
    expect(Object.keys(data![0]!)).toEqual(['daily_number', 'weekly_number'])

    // Y la boleta en si le sigue estando vedada (BR-U07).
    const { data: fila } = await seller1.from('tickets').select('id, seller_id').eq('id', ticketId)
    expect(fila).toHaveLength(0)
  })

  it('no cruza organizaciones: la rifa de otra empresa no se puede consultar', async () => {
    const { error } = await otraOrg.rpc('taken_ticket_combinations', {
      p_raffle_id: seed.demoRaffle.id,
      p_combos: [combo('1234', '5678')],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no existe|no tienes acceso/i)
  })

  it('un visitante sin sesion no puede ejecutarla', async () => {
    const { error } = await anonClient().rpc('taken_ticket_combinations', {
      p_raffle_id: seed.demoRaffle.id,
      p_combos: [combo('1234', '5678')],
    })

    expect(error).not.toBeNull()
  })

  it('rechaza un lote de mas de 1.000 combinaciones', async () => {
    const muchas = Array.from({ length: 1001 }, () => combo('1234', '5678'))
    const { error } = await owner.rpc('taken_ticket_combinations', {
      p_raffle_id: seed.demoRaffle.id,
      p_combos: muchas,
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/1\.000/)
  })
})

describe('log_ticket_import (auditoria de la importacion)', () => {
  async function ultimaImportacion(raffleId: string) {
    const { data } = await seed.svc
      .from('audit_logs')
      .select('action, entity_type, entity_id, new_values, actor_profile_id')
      .eq('action', 'ticket.import')
      .eq('entity_id', raffleId)
      .order('created_at', { ascending: false })
      .limit(1)
    return data?.[0]
  }

  it('CASO 24 — deja una fila con quien, donde y cuantas', async () => {
    const { error } = await owner.rpc('log_ticket_import', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_source: 'csv',
      p_requested: 100,
      p_inserted: 97,
      p_skipped: 3,
    })
    expect(error).toBeNull()

    const fila = await ultimaImportacion(seed.demoRaffle.id)
    expect(fila?.entity_type).toBe('raffle')
    expect(fila?.actor_profile_id).toBe(seed.ids.owner)
    expect(fila?.new_values).toMatchObject({
      source: 'csv',
      seller_id: seed.ids.seller1,
      requested: 100,
      inserted: 97,
      skipped: 3,
    })
  })

  it('un vendedor puede registrar SU propia importacion', async () => {
    const { error } = await seller1.rpc('log_ticket_import', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_source: 'json',
      p_requested: 5,
      p_inserted: 5,
      p_skipped: 0,
    })

    expect(error).toBeNull()
  })

  it('pero NO a nombre de otro vendedor', async () => {
    const { error } = await seller1.rpc('log_ticket_import', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller2,
      p_source: 'csv',
      p_requested: 5,
      p_inserted: 5,
      p_skipped: 0,
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/permiso/i)
  })

  it('rechaza un tipo de archivo que no existe', async () => {
    const { error } = await owner.rpc('log_ticket_import', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_source: 'xlsx',
      p_requested: 1,
      p_inserted: 1,
      p_skipped: 0,
    })

    expect(error).not.toBeNull()
  })

  it('la bitacora sigue siendo de solo anexado: nadie la edita ni la borra', async () => {
    const { error: updateError } = await owner
      .from('audit_logs')
      .update({ action: 'otra.cosa' })
      .eq('action', 'ticket.import')
    const { error: deleteError } = await owner
      .from('audit_logs')
      .delete()
      .eq('action', 'ticket.import')

    expect(updateError).not.toBeNull()
    expect(deleteError).not.toBeNull()
  })
})

describe('Guardado del lote importado', () => {
  it('CASO 23 y 20 — el lote entra entero, y una combinacion ya tomada se informa sin tumbarlo', async () => {
    const tomada = numeros()
    await crearBoleta(seed.ids.seller1, tomada.daily, tomada.weekly)

    const contadorAntes = await contadorDeCodigos()
    const nuevas = [numeros(), numeros()]
    const { data, error } = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_rows: [
        { daily_number: nuevas[0]!.daily, weekly_number: nuevas[0]!.weekly },
        { daily_number: tomada.daily, weekly_number: tomada.weekly },
        { daily_number: nuevas[1]!.daily, weekly_number: nuevas[1]!.weekly },
      ],
    })

    expect(error).toBeNull()
    const resultado = data as { inserted: number; conflicts: unknown[] }
    expect(resultado.inserted).toBe(2)
    expect(resultado.conflicts).toHaveLength(1)

    /*
      El contador de codigos SUBE con el lote, incluidas las filas que acabaron
      en conflicto: se reserva el bloque entero antes de insertar. Se afirma
      aqui para que la prueba de retroceso de mas abajo signifique algo — si el
      contador no se moviera nunca, comprobar que «no se movio» tras un fallo no
      demostraria nada.
    */
    expect(await contadorDeCodigos()).toBe(contadorAntes + 3)

    // Se apuntan para limpiarlas al terminar.
    const { data: metidas } = await seed.svc
      .from('tickets')
      .select('id')
      .eq('raffle_id', seed.demoRaffle.id)
      .in('daily_number', [nuevas[0]!.daily, nuevas[1]!.daily])
    for (const fila of metidas ?? []) creadas.push(fila.id)
  })

  it('CASO 22 — si el lote falla, NO queda nada a medias: ni boletas ni códigos gastados', async () => {
    const boletasAntes = await contarBoletas()
    const contadorAntes = await contadorDeCodigos()

    /*
      Para demostrar que se deshace de verdad hace falta que falle DESPUES de
      haber empezado a escribir. Un vendedor inexistente no vale: eso se
      comprueba antes de tocar nada, y la prueba pasaria sin probar nada.

      `bulk_create_tickets` reserva el bloque de codigos —un `update` sobre
      `raffles.ticket_counter`— y solo despues inserta. Un numero de cinco
      cifras revienta contra el CHECK de la tabla (BR-N02) en ese `insert`, es
      decir con el contador ya subido. Si la funcion no fuera transaccional, el
      contador se quedaria gastado y las boletas siguientes de esa rifa
      saltarian codigos para siempre.
    */
    const buena = numeros()
    const { error } = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_rows: [
        { daily_number: buena.daily, weekly_number: buena.weekly },
        { daily_number: '12345', weekly_number: '9999' },
      ],
    })

    expect(error).not.toBeNull()
    expect(await contarBoletas()).toBe(boletasAntes)
    // Lo que de verdad demuestra el retroceso: el contador volvio a su sitio.
    expect(await contadorDeCodigos()).toBe(contadorAntes)
  })

  it('CASO 18 — un vendedor no puede crear boletas para si mismo por esta via', async () => {
    // `bulk_create_tickets` exige ser personal (is_org_staff): el importador del
    // vendedor va por otro camino, sujeto a `tickets_insert_seller`.
    const n = numeros()
    const { error } = await seller2.rpc('bulk_create_tickets', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller2,
      p_rows: [{ daily_number: n.daily, weekly_number: n.weekly }],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/permiso/i)
  })
})

/** Codigos ya repartidos en la rifa del seed (`raffles.ticket_counter`). */
async function contadorDeCodigos(): Promise<number> {
  const { data } = await seed.svc
    .from('raffles')
    .select('ticket_counter')
    .eq('id', seed.demoRaffle.id)
    .single()
  return data?.ticket_counter ?? -1
}

async function contarBoletas(): Promise<number> {
  const { count } = await seed.svc
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('raffle_id', seed.demoRaffle.id)
  return count ?? 0
}
