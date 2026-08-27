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
const clientesCreados: string[] = []

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
  const svc = serviceClient()

  // Orden obligatorio por las FK (`on delete restrict`): asignaciones -> pagos
  // -> boletas -> clientes. Desde que el importador registra abonos (BR-N14),
  // una boleta de esta suite puede tener pagos colgando.
  if (creadas.length > 0) {
    const { data: allocations } = await svc
      .from('payment_allocations')
      .select('payment_id')
      .in('ticket_id', creadas)
    const pagos = [...new Set((allocations ?? []).map((row) => row.payment_id))]

    if (pagos.length > 0) {
      await svc.from('payment_allocations').delete().in('payment_id', pagos)
      await svc.from('payments').delete().in('id', pagos)
    }
    await svc.from('commission_ledger').delete().in('ticket_id', creadas)
    await svc.from('tickets').delete().in('id', creadas)
  }
  if (clientesCreados.length > 0) {
    await svc.from('clients').delete().in('id', clientesCreados)
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

describe('Importacion administrativa con clientes (0021)', () => {
  type ResultadoImportacion = {
    requested: number
    inserted: number
    conflicts: Array<{ daily_number: string; weekly_number: string }>
    assigned: number
    clients_created: number
    clients_reused: number
  }

  function celularUnico() {
    return `31${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`
  }

  async function crearCliente(name: string, phone: string, sellerId = seed.ids.seller1) {
    const { data, error } = await seed.svc
      .from('clients')
      .insert({
        organization_id: seed.demoOrg.id,
        seller_id: sellerId,
        name,
        phone,
      })
      .select('id')
      .single()

    if (error) throw error
    clientesCreados.push(data.id)
    return data.id
  }

  /**
   * Devuelve las boletas del lote recien importado, acotando por la
   * COMBINACION completa.
   *
   * Filtrar solo por el numero diario no vale: un diario puede repetirse en
   * otra combinacion (BR-N07), asi que la consulta llegaba a devolver la boleta
   * de otra prueba —anulada, por ejemplo— y la afirmacion caia sobre la fila
   * equivocada. Fallaba una de cada tantas corridas, porque `numeros()` sortea
   * los digitos. Lo unico que es unico dentro de la rifa es el par (BR-N04).
   *
   * Filtrar tambien evita que la limpieza borre boletas que no son de esta
   * prueba (misma familia que I-035).
   */
  async function recordarBoletas(pares: { daily: string; weekly: string }[]) {
    const { data, error } = await seed.svc
      .from('tickets')
      .select('id, daily_number, weekly_number, client_id, inventory_status')
      .eq('raffle_id', seed.demoRaffle.id)
      .in(
        'daily_number',
        pares.map((par) => par.daily),
      )

    if (error) throw error
    const delLote = data.filter((ticket) =>
      pares.some((par) => par.daily === ticket.daily_number && par.weekly === ticket.weekly_number),
    )
    for (const ticket of delLote) creadas.push(ticket.id)
    return delLote
  }

  it('mezcla filas con y sin cliente y agrupa una identidad en un solo cliente', async () => {
    const conCliente1 = numeros()
    const conCliente2 = numeros()
    const sinCliente = numeros()
    const phone = celularUnico()
    const name = `Cliente importado ${phone}`

    const { data, error } = await owner.rpc('import_tickets_with_clients', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_rows: [
        {
          daily_number: conCliente1.daily,
          weekly_number: conCliente1.weekly,
          client_name: name,
          client_phone: phone,
        },
        {
          daily_number: conCliente2.daily,
          weekly_number: conCliente2.weekly,
          client_name: name.toUpperCase(),
          client_phone: `+57 ${phone.slice(0, 3)} ${phone.slice(3)}`,
        },
        { daily_number: sinCliente.daily, weekly_number: sinCliente.weekly },
      ],
    })

    expect(error).toBeNull()
    expect(data as ResultadoImportacion).toMatchObject({
      requested: 3,
      inserted: 3,
      conflicts: [],
      assigned: 2,
      clients_created: 1,
      clients_reused: 0,
    })

    const tickets = await recordarBoletas([conCliente1, conCliente2, sinCliente])
    const asignadas = tickets.filter((ticket) => ticket.inventory_status === 'assigned')
    const disponible = tickets.find(
      (ticket) =>
        ticket.daily_number === sinCliente.daily && ticket.weekly_number === sinCliente.weekly,
    )

    expect(asignadas).toHaveLength(2)
    expect(new Set(asignadas.map((ticket) => ticket.client_id)).size).toBe(1)
    expect(disponible).toMatchObject({ inventory_status: 'available', client_id: null })

    const clientId = asignadas[0]!.client_id!
    clientesCreados.push(clientId)
    const { count } = await seed.svc
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('id', clientId)
    expect(count).toBe(1)
  })

  it('reutiliza una coincidencia unica de nombre y celular de la cartera indicada', async () => {
    const number = numeros()
    const phone = celularUnico()
    const name = `Cliente existente ${phone}`
    const clientId = await crearCliente(name, phone)

    const { data, error } = await owner.rpc('import_tickets_with_clients', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_rows: [
        {
          daily_number: number.daily,
          weekly_number: number.weekly,
          client_name: name.toUpperCase(),
          client_phone: `+57 ${phone}`,
        },
      ],
    })

    expect(error).toBeNull()
    expect(data as ResultadoImportacion).toMatchObject({
      inserted: 1,
      assigned: 1,
      clients_created: 0,
      clients_reused: 1,
    })

    const [ticket] = await recordarBoletas([number])
    expect(ticket).toMatchObject({ client_id: clientId, inventory_status: 'assigned' })
  })

  it('la vista previa solo devuelve coincidencias de la cartera seleccionada', async () => {
    const phone = celularUnico()
    const ownId = await crearCliente(`Cartera uno ${phone}`, phone, seed.ids.seller1)
    await crearCliente(`Cartera dos ${phone}`, phone, seed.ids.seller2)

    const { data, error } = await owner.rpc('match_ticket_import_clients', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_clients: [{ client_key: 'grupo-1', name: `Cartera uno ${phone}`, phone }],
    })

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]).toMatchObject({ client_key: 'grupo-1', client_id: ownId })
  })

  it('un celular existente con otro nombre revierte boletas, cliente y contador', async () => {
    const phone = celularUnico()
    await crearCliente(`Nombre registrado ${phone}`, phone)
    const withClient = numeros()
    const withoutClient = numeros()
    const ticketsBefore = await contarBoletas()
    const counterBefore = await contadorDeCodigos()

    const { error } = await owner.rpc('import_tickets_with_clients', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_rows: [
        {
          daily_number: withClient.daily,
          weekly_number: withClient.weekly,
          client_name: `Nombre diferente ${phone}`,
          client_phone: phone,
        },
        { daily_number: withoutClient.daily, weekly_number: withoutClient.weekly },
      ],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/celular.+otro nombre/i)
    expect(await contarBoletas()).toBe(ticketsBefore)
    expect(await contadorDeCodigos()).toBe(counterBefore)
    const { count } = await seed.svc
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('name', `Nombre diferente ${phone}`)
    expect(count).toBe(0)
  })

  it('rechaza de forma atomica una fila con nombre pero sin celular', async () => {
    const number = numeros()
    const ticketsBefore = await contarBoletas()
    const counterBefore = await contadorDeCodigos()

    const { error } = await owner.rpc('import_tickets_with_clients', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_rows: [
        {
          daily_number: number.daily,
          weekly_number: number.weekly,
          client_name: 'Cliente sin celular',
        },
      ],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/datos de cliente inv.lidos/i)
    expect(await contarBoletas()).toBe(ticketsBefore)
    expect(await contadorDeCodigos()).toBe(counterBefore)
  })

  it('un vendedor no puede ejecutar la importacion administrativa con clientes', async () => {
    const number = numeros()
    const { error } = await seller1.rpc('import_tickets_with_clients', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_rows: [
        {
          daily_number: number.daily,
          weekly_number: number.weekly,
          client_name: 'Cliente sin permiso',
          client_phone: celularUnico(),
        },
      ],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/permiso/i)
  })

  it('no permite consultar clientes de otra organizacion', async () => {
    const { error } = await otraOrg.rpc('match_ticket_import_clients', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_clients: [{ client_key: 'grupo-1', name: 'Cliente externo', phone: celularUnico() }],
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

/**
 * La columna «Abono» del importador (BR-N14, D-129).
 *
 * Lo que se prueba aqui es justo lo que no puede probar una funcion pura: que
 * el abono llega a `payments` y `payment_allocations` de verdad —no a un campo
 * acumulado—, que el estado de la boleta lo deriva la base de datos, y que un
 * abono invalido no deja NADA a medias.
 *
 * Con sesiones reales y clave publica, como todo el proyecto: una prueba de
 * permisos que use `service_role` no prueba nada (docs/TESTING.md 2).
 */
describe('import_tickets_with_clients con abono', () => {
  type Resultado = {
    inserted: number
    assigned: number
    clients_created: number
    payments_created: number
    payments_total: number
  }

  /** El precio se LEE de la rifa; escribirlo aqui repetiria la cifra (D-098). */
  async function precioDeLaRifa(): Promise<number> {
    const { data } = await seed.svc
      .from('raffles')
      .select('ticket_price')
      .eq('id', seed.demoRaffle.id)
      .single()
    return data!.ticket_price
  }

  function celular() {
    return `31${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`
  }

  /** Las boletas del lote, acotando por la COMBINACION completa (BR-N04). */
  async function boletasDe(pares: { daily: string; weekly: string }[]) {
    const { data, error } = await seed.svc
      .from('tickets')
      .select('id, daily_number, weekly_number, client_id, sale_price, paid_amount, payment_status')
      .eq('raffle_id', seed.demoRaffle.id)
      .in(
        'daily_number',
        pares.map((par) => par.daily),
      )

    if (error) throw error
    const delLote = data.filter((ticket) =>
      pares.some((par) => par.daily === ticket.daily_number && par.weekly === ticket.weekly_number),
    )
    for (const ticket of delLote) creadas.push(ticket.id)
    return delLote
  }

  async function contarPagos(): Promise<number> {
    const { count } = await seed.svc
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', seed.demoOrg.id)
    return count ?? 0
  }

  it('CASOS 14 y 15 — el abono queda como pago y asignación, no como un campo suelto', async () => {
    const precio = await precioDeLaRifa()
    const parcial = numeros()
    const completa = numeros()
    const sinAbono = numeros()
    const phone = celular()
    const name = `Cliente con abono ${phone}`

    const { data, error } = await owner.rpc('import_tickets_with_clients', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_rows: [
        {
          daily_number: parcial.daily,
          weekly_number: parcial.weekly,
          client_name: name,
          client_phone: phone,
          abono: 20_000,
        },
        {
          daily_number: completa.daily,
          weekly_number: completa.weekly,
          client_name: name,
          client_phone: phone,
          abono: precio,
        },
        {
          daily_number: sinAbono.daily,
          weekly_number: sinAbono.weekly,
          client_name: name,
          client_phone: phone,
        },
      ],
    })

    expect(error).toBeNull()
    expect(data as Resultado).toMatchObject({
      inserted: 3,
      assigned: 3,
      clients_created: 1,
      payments_created: 2,
      payments_total: 20_000 + precio,
    })

    const boletas = await boletasDe([parcial, completa, sinAbono])
    const busca = (par: { daily: string; weekly: string }) =>
      boletas.find((t) => t.daily_number === par.daily && t.weekly_number === par.weekly)!

    // El estado NO lo escribe el importador: lo deriva la base de datos de lo
    // que hay en payment_allocations (BR-F07).
    expect(busca(parcial)).toMatchObject({ paid_amount: 20_000, payment_status: 'partial' })
    expect(busca(completa)).toMatchObject({ paid_amount: precio, payment_status: 'paid' })
    expect(busca(sinAbono)).toMatchObject({ paid_amount: 0, payment_status: 'unpaid' })

    // Y el saldo de la pagada queda EXACTAMENTE en cero: lo abonado es lo que
    // vale la boleta, sin un peso de mas ni de menos.
    expect(busca(completa).sale_price).toBe(precio)
    expect(busca(completa).paid_amount).toBe(precio)

    clientesCreados.push(busca(parcial).client_id!)

    // El movimiento existe de verdad: una fila de pago con su asignacion.
    const { data: allocations } = await seed.svc
      .from('payment_allocations')
      .select('amount, ticket_id, payment_id')
      .in('ticket_id', [busca(parcial).id, busca(completa).id, busca(sinAbono).id])

    expect(allocations).toHaveLength(2)
    // Cada abono es de SU boleta: dos pagos distintos, no uno repartido.
    expect(new Set(allocations!.map((row) => row.payment_id)).size).toBe(2)
    expect(allocations!.find((row) => row.ticket_id === busca(parcial).id)?.amount).toBe(20_000)

    const { data: pagos } = await seed.svc
      .from('payments')
      .select('total_amount, payment_method, notes, seller_id')
      .in(
        'id',
        allocations!.map((row) => row.payment_id),
      )

    expect(pagos).toHaveLength(2)
    for (const pago of pagos!) {
      expect(pago.seller_id).toBe(seed.ids.seller1)
      expect(pago.notes).toMatch(/import/i)
    }
  })

  it('CASO 25 — un abono por encima del precio no deja boleta, cliente ni pago', async () => {
    const precio = await precioDeLaRifa()
    const number = numeros()
    const phone = celular()
    const boletasAntes = await contarBoletas()
    const pagosAntes = await contarPagos()
    const contadorAntes = await contadorDeCodigos()

    const { error } = await owner.rpc('import_tickets_with_clients', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_rows: [
        {
          daily_number: number.daily,
          weekly_number: number.weekly,
          client_name: `Cliente pasado ${phone}`,
          client_phone: phone,
          abono: precio + 1,
        },
      ],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/supera el precio/i)
    expect(await contarBoletas()).toBe(boletasAntes)
    expect(await contarPagos()).toBe(pagosAntes)
    expect(await contadorDeCodigos()).toBe(contadorAntes)

    const { count } = await seed.svc
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('phone', phone)
    expect(count).toBe(0)
  })

  it('un abono sin cliente se rechaza: sin venta no hay dónde aplicarlo', async () => {
    const number = numeros()
    const boletasAntes = await contarBoletas()

    const { error } = await owner.rpc('import_tickets_with_clients', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_rows: [{ daily_number: number.daily, weekly_number: number.weekly, abono: 20_000 }],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no tiene cliente/i)
    expect(await contarBoletas()).toBe(boletasAntes)
  })

  it('CASO 16 — cero, negativo y decimal se rechazan antes de escribir nada', async () => {
    const boletasAntes = await contarBoletas()

    for (const abono of [0, -20_000, 20_000.5]) {
      const number = numeros()
      const phone = celular()
      const { error } = await owner.rpc('import_tickets_with_clients', {
        p_raffle_id: seed.demoRaffle.id,
        p_seller_id: seed.ids.seller1,
        p_rows: [
          {
            daily_number: number.daily,
            weekly_number: number.weekly,
            client_name: `Cliente ${phone}`,
            client_phone: phone,
            abono,
          },
        ],
      })

      expect(error, String(abono)).not.toBeNull()
      expect(error!.message).toMatch(/entero y mayor que cero/i)
    }

    expect(await contarBoletas()).toBe(boletasAntes)
  })

  it('un abono que llega como texto se rechaza sin reventar el cast', async () => {
    // Si la comprobacion se escribiera con `and` en vez de `case`, PostgreSQL
    // podria intentar el cast antes de mirar el tipo y devolver un error de
    // motor en vez de un mensaje entendible.
    const number = numeros()
    const phone = celular()

    const { error } = await owner.rpc('import_tickets_with_clients', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_rows: [
        {
          daily_number: number.daily,
          weekly_number: number.weekly,
          client_name: `Cliente ${phone}`,
          client_phone: phone,
          abono: 'Cancelado',
        },
      ],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/entero y mayor que cero/i)
    expect(error!.message).not.toMatch(/cannot cast/i)
  })

  it('CASO 26 — un vendedor no puede importar abonos por esta ruta', async () => {
    const number = numeros()
    const phone = celular()

    const { error } = await seller1.rpc('import_tickets_with_clients', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_rows: [
        {
          daily_number: number.daily,
          weekly_number: number.weekly,
          client_name: `Cliente ${phone}`,
          client_phone: phone,
          abono: 20_000,
        },
      ],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/permiso/i)
  })

  it('CASO 1 — sin la clave «abono» la importación se comporta como siempre', async () => {
    const number = numeros()
    const pagosAntes = await contarPagos()

    const { data, error } = await owner.rpc('import_tickets_with_clients', {
      p_raffle_id: seed.demoRaffle.id,
      p_seller_id: seed.ids.seller1,
      p_rows: [{ daily_number: number.daily, weekly_number: number.weekly }],
    })

    expect(error).toBeNull()
    expect(data as Resultado).toMatchObject({
      inserted: 1,
      assigned: 0,
      payments_created: 0,
      payments_total: 0,
    })
    expect(await contarPagos()).toBe(pagosAntes)

    const [boleta] = await boletasDe([number])
    expect(boleta).toMatchObject({ client_id: null, paid_amount: 0, payment_status: 'unpaid' })
  })
})
