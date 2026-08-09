import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadSeedContext, serviceClient, signInAs, USERS, type Client } from './helpers'

/**
 * Acciones masivas sobre boletas: las cinco funciones de la migracion 0020
 * (BR-B01..BR-B08, D-082).
 *
 * Lo que se prueba aqui no se puede probar en el navegador: que el servidor
 * vuelva a comprobar TODAS las condiciones con la fila bloqueada, que un lote
 * con una sola boleta invalida no cambie ninguna, y que un vendedor no pueda
 * tocar boletas ajenas por muchos ids que mande.
 *
 * Con sesiones reales y clave publica, nunca `service_role`: una prueba de
 * permisos hecha con la clave de servicio no prueba nada (docs/TESTING.md 2).
 * `service_role` se usa solo para PREPARAR datos y para simular lo que hace
 * otra persona mientras el lote esta abierto.
 */

let seed: Awaited<ReturnType<typeof loadSeedContext>>
let owner: Client
let admin: Client
let seller1: Client
let seller2: Client
let otraOrg: Client

/** Boletas creadas por esta suite. Se borran al terminar (I-035). */
const creadas: string[] = []

function numeros() {
  const n = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return { daily: n(), weekly: n() }
}

type EstadoBoleta = 'draft' | 'pending_approval' | 'available'

/** Crea una boleta nueva con numeros libres y devuelve su id. */
async function crearBoleta(
  sellerId: string,
  estado: EstadoBoleta = 'available',
  raffleId = seed.demoRaffle.id,
  orgId = seed.demoOrg.id,
): Promise<string> {
  for (let intento = 0; intento < 20; intento += 1) {
    const { daily, weekly } = numeros()
    const { data, error } = await seed.svc
      .from('tickets')
      .insert({
        organization_id: orgId,
        raffle_id: raffleId,
        seller_id: sellerId,
        created_by: sellerId,
        daily_number: estado === 'draft' ? null : daily,
        weekly_number: estado === 'draft' ? null : weekly,
        inventory_status: estado,
      })
      .select('id')
      .single()

    if (!error) {
      creadas.push(data.id)
      return data.id
    }
    // 23505: la combinacion aleatoria ya existia. Se reintenta con otra.
    if (error.code !== '23505') throw error
  }
  throw new Error('No se encontro una combinacion libre tras 20 intentos')
}

async function crearBoletas(cantidad: number, sellerId: string): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < cantidad; i += 1) ids.push(await crearBoleta(sellerId))
  return ids
}

/**
 * Muchas boletas de una sola sentencia, para las pruebas de volumen.
 *
 * Combina un numero diario secuencial con un semanal desplazado por una base
 * aleatoria: las parejas son distintas entre si y practicamente nunca chocan con
 * las del seed. `ignoreDuplicates` remata el caso raro, y se devuelven las que
 * de verdad entraron.
 */
async function crearLote(cantidad: number, sellerId: string): Promise<string[]> {
  const base = Math.floor(Math.random() * 10000)
  const filas = Array.from({ length: cantidad }, (_, index) => ({
    organization_id: seed.demoOrg.id,
    raffle_id: seed.demoRaffle.id,
    seller_id: sellerId,
    created_by: sellerId,
    daily_number: String(index).padStart(4, '0'),
    weekly_number: String((base + index) % 10000).padStart(4, '0'),
    inventory_status: 'available' as const,
  }))

  const { data, error } = await seed.svc
    .from('tickets')
    .upsert(filas, {
      onConflict: 'organization_id,raffle_id,daily_number,weekly_number',
      ignoreDuplicates: true,
    })
    .select('id')

  if (error) throw error
  const ids = (data ?? []).map((row) => row.id)
  creadas.push(...ids)
  return ids
}

async function estadoDe(id: string) {
  const { data } = await seed.svc
    .from('tickets')
    .select('inventory_status, seller_id, client_id, cancel_reason')
    .eq('id', id)
    .maybeSingle()
  return data
}

async function existe(id: string) {
  const { count } = await seed.svc
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('id', id)
  return (count ?? 0) > 0
}

beforeAll(async () => {
  seed = await loadSeedContext()
  ;[owner, admin, seller1, seller2, otraOrg] = await Promise.all([
    signInAs(USERS.owner),
    signInAs(USERS.admin),
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

// ---------------------------------------------------------------------------
// Elegibilidad
// ---------------------------------------------------------------------------

describe('ticket_bulk_eligibility (F10-01)', () => {
  it('marca disponible: se puede asignar, anular, cambiar de vendedor y eliminar', async () => {
    const id = await crearBoleta(seed.ids.seller1)

    const { data, error } = await owner.rpc('ticket_bulk_eligibility', { p_ticket_ids: [id] })

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject({
      ticket_id: id,
      can_assign: true,
      can_cancel: true,
      can_change_seller: true,
      can_delete: true,
      has_client: false,
      has_payments: false,
    })
  })

  it('una boleta vendida no se puede asignar, ni cambiar de vendedor, ni eliminar', async () => {
    const vendida = seed.svc
      .from('tickets')
      .select('id')
      .eq('inventory_status', 'assigned')
      .limit(1)
      .single()

    const { data: fila } = await vendida
    const { data } = await owner.rpc('ticket_bulk_eligibility', { p_ticket_ids: [fila!.id] })

    expect(data![0]).toMatchObject({
      can_assign: false,
      can_change_seller: false,
      can_delete: false,
      has_client: true,
    })
  })

  it('una boleta anulada no admite ninguna accion masiva', async () => {
    const id = await crearBoleta(seed.ids.seller1)
    await owner.rpc('cancel_ticket', { p_ticket_id: id, p_reason: 'Prueba de elegibilidad' })

    const { data } = await owner.rpc('ticket_bulk_eligibility', { p_ticket_ids: [id] })

    expect(data![0]).toMatchObject({
      can_assign: false,
      can_cancel: false,
      can_change_seller: false,
      // BR-N08: su combinacion queda reservada, asi que la fila NO se borra.
      can_delete: false,
    })
  })

  it('un vendedor solo recibe sus boletas: las ajenas no vuelven (BR-U07)', async () => {
    const propia = await crearBoleta(seed.ids.seller1)
    const ajena = await crearBoleta(seed.ids.seller2)

    const { data } = await seller1.rpc('ticket_bulk_eligibility', {
      p_ticket_ids: [propia, ajena],
    })

    expect(data!.map((row) => row.ticket_id)).toEqual([propia])
  })

  it('otra organizacion no recibe nada, ni con los ids exactos', async () => {
    const id = await crearBoleta(seed.ids.seller1)

    const { data } = await otraOrg.rpc('ticket_bulk_eligibility', { p_ticket_ids: [id] })

    expect(data).toEqual([])
  })

  it('rechaza mas de 1.000 ids de una vez', async () => {
    const falsos = Array.from({ length: 1001 }, () => crypto.randomUUID())

    const { error } = await owner.rpc('ticket_bulk_eligibility', { p_ticket_ids: falsos })

    expect(error?.message).toMatch(/1\.000/)
  })
})

// ---------------------------------------------------------------------------
// Anulacion masiva
// ---------------------------------------------------------------------------

describe('bulk_cancel_tickets (F10-02)', () => {
  it('anula todas las boletas del lote con el mismo motivo', async () => {
    const ids = await crearBoletas(3, seed.ids.seller1)

    const { data, error } = await owner.rpc('bulk_cancel_tickets', {
      p_ticket_ids: ids,
      p_reason: 'Se cargaron numeros equivocados',
    })

    expect(error).toBeNull()
    expect(data).toBe(3)
    for (const id of ids) {
      const fila = await estadoDe(id)
      expect(fila?.inventory_status).toBe('cancelled')
      expect(fila?.cancel_reason).toBe('Se cargaron numeros equivocados')
    }
  })

  it('exige motivo de al menos 5 caracteres', async () => {
    const ids = await crearBoletas(2, seed.ids.seller1)

    const { error } = await owner.rpc('bulk_cancel_tickets', { p_ticket_ids: ids, p_reason: 'no' })

    expect(error?.message).toMatch(/motivo/i)
    expect((await estadoDe(ids[0]!))?.inventory_status).toBe('available')
  })

  it('TODO O NADA: una boleta ya anulada dentro del lote impide anular las demas', async () => {
    const ids = await crearBoletas(3, seed.ids.seller1)
    await owner.rpc('cancel_ticket', { p_ticket_id: ids[1]!, p_reason: 'Anulada de antemano' })

    const { error } = await owner.rpc('bulk_cancel_tickets', {
      p_ticket_ids: ids,
      p_reason: 'Intento de anulacion en lote',
    })

    expect(error?.message).toMatch(/No se realizó ningún cambio/)
    expect((await estadoDe(ids[0]!))?.inventory_status).toBe('available')
    expect((await estadoDe(ids[2]!))?.inventory_status).toBe('available')
  })

  it('BR-I11: una boleta con pagos activos bloquea el lote entero', async () => {
    const { data: conPago } = await seed.svc
      .from('payment_allocations')
      .select('ticket_id, payments!inner(voided_at)')
      .is('payments.voided_at', null)
      .limit(1)
      .single()

    const libres = await crearBoletas(2, seed.ids.seller1)
    const ids = [...libres, conPago!.ticket_id]

    const { error } = await owner.rpc('bulk_cancel_tickets', {
      p_ticket_ids: ids,
      p_reason: 'Intento con una boleta pagada',
    })

    expect(error?.message).toMatch(/No se realizó ningún cambio/)
    expect((await estadoDe(libres[0]!))?.inventory_status).toBe('available')
  })

  it('CONCURRENCIA: si otra persona anula una mientras tanto, no cambia ninguna', async () => {
    const ids = await crearBoletas(3, seed.ids.seller1)

    // Lo que haria otro administrador entre seleccionar y confirmar.
    await admin.rpc('cancel_ticket', { p_ticket_id: ids[2]!, p_reason: 'Anulada por otro admin' })

    const { error } = await owner.rpc('bulk_cancel_tickets', {
      p_ticket_ids: ids,
      p_reason: 'Confirmacion tardia',
    })

    expect(error).not.toBeNull()
    expect((await estadoDe(ids[0]!))?.inventory_status).toBe('available')
    expect((await estadoDe(ids[1]!))?.inventory_status).toBe('available')
  })

  it('un vendedor no puede anular en lote, ni siquiera sus propias boletas (BR-I10)', async () => {
    const ids = await crearBoletas(2, seed.ids.seller1)

    const { error } = await seller1.rpc('bulk_cancel_tickets', {
      p_ticket_ids: ids,
      p_reason: 'Intento del vendedor',
    })

    expect(error).not.toBeNull()
    expect((await estadoDe(ids[0]!))?.inventory_status).toBe('available')
  })

  it('otra organizacion no puede anular estas boletas ni conociendo sus ids', async () => {
    const ids = await crearBoletas(2, seed.ids.seller1)

    const { error } = await otraOrg.rpc('bulk_cancel_tickets', {
      p_ticket_ids: ids,
      p_reason: 'Intento desde otra organizacion',
    })

    expect(error).not.toBeNull()
    expect((await estadoDe(ids[0]!))?.inventory_status).toBe('available')
  })

  it('deja una fila de bitacora del lote, ademas de la de cada boleta', async () => {
    const ids = await crearBoletas(2, seed.ids.seller1)
    await owner.rpc('bulk_cancel_tickets', {
      p_ticket_ids: ids,
      p_reason: 'Motivo auditado del lote',
    })

    const { data } = await seed.svc
      .from('audit_logs')
      .select('action, new_values')
      .eq('action', 'ticket.bulk_cancel')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    expect(data!.new_values).toMatchObject({ count: 2, reason: 'Motivo auditado del lote' })

    const { count } = await seed.svc
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'ticket.cancel')
      .in('entity_id', ids)

    expect(count).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Cambio masivo de vendedor
// ---------------------------------------------------------------------------

describe('bulk_change_ticket_seller (F10-03)', () => {
  it('pasa todas las boletas al vendedor indicado', async () => {
    const ids = await crearBoletas(3, seed.ids.seller1)

    const { data, error } = await owner.rpc('bulk_change_ticket_seller', {
      p_ticket_ids: ids,
      p_seller_id: seed.ids.seller2,
    })

    expect(error).toBeNull()
    expect(data).toBe(3)
    for (const id of ids) {
      expect((await estadoDe(id))?.seller_id).toBe(seed.ids.seller2)
    }
  })

  it('TODO O NADA: una boleta vendida dentro del lote lo bloquea entero (BR-C05)', async () => {
    const libres = await crearBoletas(2, seed.ids.seller1)
    const { data: vendida } = await seed.svc
      .from('tickets')
      .select('id')
      .eq('inventory_status', 'assigned')
      .eq('seller_id', seed.ids.seller1)
      .limit(1)
      .single()

    const { error } = await owner.rpc('bulk_change_ticket_seller', {
      p_ticket_ids: [...libres, vendida!.id],
      p_seller_id: seed.ids.seller2,
    })

    expect(error?.message).toMatch(/No se realizó ningún cambio/)
    expect((await estadoDe(libres[0]!))?.seller_id).toBe(seed.ids.seller1)
  })

  it('rechaza un destino que no es vendedor activo de la organizacion', async () => {
    const ids = await crearBoletas(2, seed.ids.seller1)

    const { error } = await owner.rpc('bulk_change_ticket_seller', {
      p_ticket_ids: ids,
      // El Owner no es vendedor.
      p_seller_id: seed.ids.owner,
    })

    expect(error?.message).toMatch(/vendedor activo/i)
    expect((await estadoDe(ids[0]!))?.seller_id).toBe(seed.ids.seller1)
  })

  it('rechaza un vendedor de otra organizacion', async () => {
    const ids = await crearBoletas(2, seed.ids.seller1)

    const { error } = await owner.rpc('bulk_change_ticket_seller', {
      p_ticket_ids: ids,
      p_seller_id: seed.ids.otherOrgSeller,
    })

    expect(error).not.toBeNull()
    expect((await estadoDe(ids[0]!))?.seller_id).toBe(seed.ids.seller1)
  })

  it('un vendedor no puede repartirse boletas a si mismo', async () => {
    const ids = await crearBoletas(2, seed.ids.seller1)

    const { error } = await seller2.rpc('bulk_change_ticket_seller', {
      p_ticket_ids: ids,
      p_seller_id: seed.ids.seller2,
    })

    expect(error).not.toBeNull()
    expect((await estadoDe(ids[0]!))?.seller_id).toBe(seed.ids.seller1)
  })
})

// ---------------------------------------------------------------------------
// Eliminacion masiva (borrado fisico)
// ---------------------------------------------------------------------------

describe('bulk_delete_tickets (F10-04)', () => {
  it('borra fisicamente las boletas que nunca entraron al flujo comercial', async () => {
    const ids = await crearBoletas(3, seed.ids.seller1)

    const { data, error } = await owner.rpc('bulk_delete_tickets', {
      p_ticket_ids: ids,
      p_reason: 'Importacion equivocada',
    })

    expect(error).toBeNull()
    expect(data).toBe(3)
    for (const id of ids) expect(await existe(id)).toBe(false)
  })

  it('acepta borradores y boletas pendientes de aprobacion', async () => {
    const borrador = await crearBoleta(seed.ids.seller1, 'draft')
    const pendiente = await crearBoleta(seed.ids.seller1, 'pending_approval')

    const { error } = await owner.rpc('bulk_delete_tickets', {
      p_ticket_ids: [borrador, pendiente],
      p_reason: 'Archivo cargado por error',
    })

    expect(error).toBeNull()
    expect(await existe(borrador)).toBe(false)
    expect(await existe(pendiente)).toBe(false)
  })

  it('BLOQUEA una boleta con cliente, y con ella el lote entero', async () => {
    const libres = await crearBoletas(2, seed.ids.seller1)
    const { data: vendida } = await seed.svc
      .from('tickets')
      .select('id')
      .eq('inventory_status', 'assigned')
      .limit(1)
      .single()

    const { error } = await owner.rpc('bulk_delete_tickets', {
      p_ticket_ids: [...libres, vendida!.id],
      p_reason: 'Intento con una boleta vendida',
    })

    expect(error?.message).toMatch(/No se realizó ningún cambio/)
    expect(await existe(libres[0]!)).toBe(true)
    expect(await existe(vendida!.id)).toBe(true)
  })

  it('BLOQUEA una boleta con pagos, aunque el pago este anulado', async () => {
    const { data: conPagoAnulado } = await seed.svc
      .from('payment_allocations')
      .select('ticket_id, payments!inner(voided_at)')
      .not('payments.voided_at', 'is', null)
      .limit(1)
      .single()

    const { error } = await owner.rpc('bulk_delete_tickets', {
      p_ticket_ids: [conPagoAnulado!.ticket_id],
      p_reason: 'Intento con historial de pagos',
    })

    expect(error?.message).toMatch(/No se realizó ningún cambio/)
    expect(await existe(conPagoAnulado!.ticket_id)).toBe(true)
  })

  it('BR-N08: una boleta anulada nunca se elimina, su combinacion sigue reservada', async () => {
    const id = await crearBoleta(seed.ids.seller1)
    await owner.rpc('cancel_ticket', { p_ticket_id: id, p_reason: 'Anulada antes de intentar' })

    const { error } = await owner.rpc('bulk_delete_tickets', {
      p_ticket_ids: [id],
      p_reason: 'Intento de borrar una anulada',
    })

    expect(error?.message).toMatch(/No se realizó ningún cambio/)
    expect(await existe(id)).toBe(true)
  })

  it('exige motivo de al menos 5 caracteres', async () => {
    const ids = await crearBoletas(1, seed.ids.seller1)

    const { error } = await owner.rpc('bulk_delete_tickets', { p_ticket_ids: ids, p_reason: '' })

    expect(error?.message).toMatch(/motivo/i)
    expect(await existe(ids[0]!)).toBe(true)
  })

  it('un vendedor no puede eliminar boletas, ni las suyas', async () => {
    const ids = await crearBoletas(2, seed.ids.seller1)

    const { error } = await seller1.rpc('bulk_delete_tickets', {
      p_ticket_ids: ids,
      p_reason: 'Intento del vendedor',
    })

    expect(error).not.toBeNull()
    expect(await existe(ids[0]!)).toBe(true)
  })

  it('otra organizacion no puede eliminar estas boletas ni conociendo sus ids', async () => {
    const ids = await crearBoletas(2, seed.ids.seller1)

    const { error } = await otraOrg.rpc('bulk_delete_tickets', {
      p_ticket_ids: ids,
      p_reason: 'Intento desde otra organizacion',
    })

    expect(error).not.toBeNull()
    expect(await existe(ids[0]!)).toBe(true)
  })

  it('deja rastro: una fila por boleta y una del lote, con motivo y numeros', async () => {
    const id = await crearBoleta(seed.ids.seller1)
    const { data: antes } = await seed.svc
      .from('tickets')
      .select('daily_number, weekly_number')
      .eq('id', id)
      .single()

    await owner.rpc('bulk_delete_tickets', {
      p_ticket_ids: [id],
      p_reason: 'Numeros cargados por accidente',
    })

    const { data: porBoleta } = await seed.svc
      .from('audit_logs')
      .select('old_values')
      .eq('action', 'ticket.delete')
      .eq('entity_id', id)
      .single()

    expect(porBoleta!.old_values).toMatchObject({
      daily_number: antes!.daily_number,
      weekly_number: antes!.weekly_number,
    })

    const { data: delLote } = await seed.svc
      .from('audit_logs')
      .select('old_values, new_values, actor_profile_id, organization_id')
      .eq('action', 'ticket.bulk_delete')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    expect(delLote!.new_values).toMatchObject({
      count: 1,
      reason: 'Numeros cargados por accidente',
    })
    expect(delLote!.actor_profile_id).toBe(seed.ids.owner)
    expect(JSON.stringify(delLote!.old_values)).toContain(antes!.daily_number!)
  })

  it('sigue sin existir privilegio de DELETE directo sobre tickets (D-038)', async () => {
    const id = await crearBoleta(seed.ids.seller1)

    const { error } = await owner.from('tickets').delete().eq('id', id)

    expect(error).not.toBeNull()
    expect(await existe(id)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Asignacion masiva
// ---------------------------------------------------------------------------

describe('bulk_assign_tickets (F10-05)', () => {
  it('el vendedor vende varias boletas al mismo cliente en una sola operacion', async () => {
    const ids = await crearBoletas(4, seed.ids.seller1)

    const { data, error } = await seller1.rpc('bulk_assign_tickets', {
      p_ticket_ids: ids,
      p_client_id: seed.clients.ana.id,
      p_sale_date: '2026-08-08',
    })

    expect(error).toBeNull()
    expect(data).toBe(4)
    for (const id of ids) {
      const fila = await estadoDe(id)
      expect(fila?.inventory_status).toBe('assigned')
      expect(fila?.client_id).toBe(seed.clients.ana.id)
    }
  })

  it('copia el precio vigente de la rifa a cada boleta (BR-P03)', async () => {
    const ids = await crearBoletas(2, seed.ids.seller1)
    const { data: rifa } = await seed.svc
      .from('raffles')
      .select('ticket_price')
      .eq('id', seed.demoRaffle.id)
      .single()

    await seller1.rpc('bulk_assign_tickets', {
      p_ticket_ids: ids,
      p_client_id: seed.clients.ana.id,
      p_sale_date: '2026-08-08',
    })

    const { data: filas } = await seed.svc.from('tickets').select('sale_price').in('id', ids)
    for (const fila of filas!) expect(fila.sale_price).toBe(rifa!.ticket_price)
  })

  it('BLOQUEA una boleta de otro vendedor, y con ella el lote (BR-U07)', async () => {
    const propias = await crearBoletas(2, seed.ids.seller1)
    const ajena = await crearBoleta(seed.ids.seller2)

    const { error } = await seller1.rpc('bulk_assign_tickets', {
      p_ticket_ids: [...propias, ajena],
      p_client_id: seed.clients.ana.id,
      p_sale_date: '2026-08-08',
    })

    expect(error).not.toBeNull()
    expect((await estadoDe(propias[0]!))?.inventory_status).toBe('available')
    expect((await estadoDe(ajena))?.inventory_status).toBe('available')
  })

  it('BLOQUEA una boleta pendiente de aprobacion', async () => {
    const disponible = await crearBoleta(seed.ids.seller1)
    const pendiente = await crearBoleta(seed.ids.seller1, 'pending_approval')

    const { error } = await seller1.rpc('bulk_assign_tickets', {
      p_ticket_ids: [disponible, pendiente],
      p_client_id: seed.clients.ana.id,
      p_sale_date: '2026-08-08',
    })

    expect(error?.message).toMatch(/No se realizó ningún cambio/)
    expect((await estadoDe(disponible))?.inventory_status).toBe('available')
  })

  it('BLOQUEA una boleta anulada', async () => {
    const disponible = await crearBoleta(seed.ids.seller1)
    const anulada = await crearBoleta(seed.ids.seller1)
    await owner.rpc('cancel_ticket', { p_ticket_id: anulada, p_reason: 'Anulada antes de vender' })

    const { error } = await seller1.rpc('bulk_assign_tickets', {
      p_ticket_ids: [disponible, anulada],
      p_client_id: seed.clients.ana.id,
      p_sale_date: '2026-08-08',
    })

    expect(error?.message).toMatch(/No se realizó ningún cambio/)
    expect((await estadoDe(disponible))?.inventory_status).toBe('available')
  })

  it('BLOQUEA un cliente de otro vendedor (BR-C05)', async () => {
    const ids = await crearBoletas(2, seed.ids.seller1)

    const { error } = await seller1.rpc('bulk_assign_tickets', {
      p_ticket_ids: ids,
      // Diego Marin es cliente de vendedor2.
      p_client_id: seed.clients.diego.id,
      p_sale_date: '2026-08-08',
    })

    expect(error).not.toBeNull()
    expect((await estadoDe(ids[0]!))?.inventory_status).toBe('available')
  })

  it('CONCURRENCIA: si alguien anula una mientras el dialogo esta abierto, no vende ninguna', async () => {
    const ids = await crearBoletas(3, seed.ids.seller1)

    await admin.rpc('cancel_ticket', { p_ticket_id: ids[1]!, p_reason: 'Anulada por el admin' })

    const { error } = await seller1.rpc('bulk_assign_tickets', {
      p_ticket_ids: ids,
      p_client_id: seed.clients.ana.id,
      p_sale_date: '2026-08-08',
    })

    expect(error).not.toBeNull()
    expect((await estadoDe(ids[0]!))?.inventory_status).toBe('available')
    expect((await estadoDe(ids[2]!))?.inventory_status).toBe('available')
  })

  it('un vendedor de otra organizacion no puede asignarlas ni con los ids exactos', async () => {
    const ids = await crearBoletas(2, seed.ids.seller1)

    const { error } = await otraOrg.rpc('bulk_assign_tickets', {
      p_ticket_ids: ids,
      p_client_id: seed.clients.ana.id,
      p_sale_date: '2026-08-08',
    })

    expect(error).not.toBeNull()
    expect((await estadoDe(ids[0]!))?.inventory_status).toBe('available')
  })

  it('deja una fila de bitacora del lote y una asignacion por boleta', async () => {
    const ids = await crearBoletas(2, seed.ids.seller1)
    await seller1.rpc('bulk_assign_tickets', {
      p_ticket_ids: ids,
      p_client_id: seed.clients.ana.id,
      p_sale_date: '2026-08-08',
    })

    const { data: lote } = await seed.svc
      .from('audit_logs')
      .select('new_values')
      .eq('action', 'ticket.bulk_assign')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    expect(lote!.new_values).toMatchObject({ count: 2 })

    const { count } = await seed.svc
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'ticket.assign_client')
      .in('entity_id', ids)

    expect(count).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Entrada y volumen
// ---------------------------------------------------------------------------

describe('entrada y volumen (F10-06)', () => {
  it('rechaza una lista vacia', async () => {
    const { error } = await owner.rpc('bulk_cancel_tickets', {
      p_ticket_ids: [],
      p_reason: 'Lista vacia',
    })

    expect(error).not.toBeNull()
  })

  it('rechaza mas de 1.000 boletas en un lote', async () => {
    const falsos = Array.from({ length: 1001 }, () => crypto.randomUUID())

    const { error } = await owner.rpc('bulk_cancel_tickets', {
      p_ticket_ids: falsos,
      p_reason: 'Lote demasiado grande',
    })

    expect(error?.message).toMatch(/1\.000/)
  })

  it('ids repetidos cuentan una sola vez', async () => {
    const id = await crearBoleta(seed.ids.seller1)

    const { data, error } = await owner.rpc('bulk_cancel_tickets', {
      p_ticket_ids: [id, id, id],
      p_reason: 'Ids repetidos en la lista',
    })

    expect(error).toBeNull()
    expect(data).toBe(1)
  })

  it('un id inventado no cambia nada y no revela si existe', async () => {
    const real = await crearBoleta(seed.ids.seller1)
    const inventado = crypto.randomUUID()

    const { error } = await owner.rpc('bulk_cancel_tickets', {
      p_ticket_ids: [real, inventado],
      p_reason: 'Con un id inventado',
    })

    expect(error?.message).toMatch(/No se realizó ningún cambio/)
    expect(error?.message).not.toContain(inventado)
    expect((await estadoDe(real))?.inventory_status).toBe('available')
  })

  it('un lote de 100 boletas se anula entero en una sola llamada', async () => {
    const ids = await crearBoletas(100, seed.ids.seller1)

    const inicio = Date.now()
    const { data, error } = await owner.rpc('bulk_cancel_tickets', {
      p_ticket_ids: ids,
      p_reason: 'Lote de cien boletas',
    })
    const ms = Date.now() - inicio

    expect(error).toBeNull()
    expect(data).toBe(100)
    // Referencia, no umbral estricto: lo que se comprueba es que no sea lineal
    // en peticiones (100 boletas = 1 llamada, no 100).
    expect(ms).toBeLessThan(15_000)
  })

  it('500 boletas se eliminan en una sola llamada', async () => {
    const ids = await crearLote(500, seed.ids.seller1)

    const inicio = Date.now()
    const { data, error } = await owner.rpc('bulk_delete_tickets', {
      p_ticket_ids: ids,
      p_reason: 'Importacion masiva equivocada',
    })
    const ms = Date.now() - inicio

    expect(error).toBeNull()
    expect(data).toBe(ids.length)
    expect(ms).toBeLessThan(30_000)
  })

  it('1.000 boletas —el tope— se anulan en una sola llamada', async () => {
    const ids = await crearLote(1000, seed.ids.seller1)

    const inicio = Date.now()
    const { data, error } = await owner.rpc('bulk_cancel_tickets', {
      p_ticket_ids: ids,
      p_reason: 'Lote en el tope de mil boletas',
    })
    const ms = Date.now() - inicio

    expect(error).toBeNull()
    expect(data).toBe(ids.length)
    expect(ms).toBeLessThan(60_000)
  })

  it('la elegibilidad de 1.000 boletas se resuelve en una sola consulta', async () => {
    const ids = await crearLote(1000, seed.ids.seller1)

    const inicio = Date.now()
    const { data, error } = await owner.rpc('ticket_bulk_eligibility', { p_ticket_ids: ids })
    const ms = Date.now() - inicio

    expect(error).toBeNull()
    expect(data).toHaveLength(ids.length)
    expect(ms).toBeLessThan(30_000)
  })
})
