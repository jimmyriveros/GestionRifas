/**
 * Inventario comun, generador por rangos, lotes y apartados (D-257, 0081).
 *
 * Las pruebas operan con SESIONES REALES (`signInAs`): la autoridad son las
 * funciones de la base y lo que se prueba es lo que un vendedor o el personal
 * pueden hacer por la API. `pg` como superusuario solo prepara, mueve el reloj
 * de un apartado y comprueba (D-043).
 *
 * DATOS PROPIOS. Tres rifas activas «(pruebas)» y clientes propios: nada del
 * seed cambia de recuento.
 *
 * LAS CIFRAS DE CADA RIFA (D-261). Cada número tiene exactamente las cifras de
 * su rifa, así que la rifa principal es de dos números de DOS cifras —lo que
 * estas pruebas ya escribían—; la «ancha», de cuatro y dos, para el tope de
 * 100.000, la continuación de 6.000 y los catálogos; y la de loterías, de
 * cuatro y cuatro, como la rifa real. Todo se borra al final en UNA transaccion por `pg`
 * (I-059): `payments_balanced` es un constraint trigger diferido, y las
 * coincidencias de loteria apuntan a las boletas con `on delete restrict`.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  GENERATION_MAX,
  GROUP_RANGE_MESSAGES,
  HOLD_DEFAULT_MAX_ACTIVE,
  HOLD_DEFAULT_MINUTES,
  HOLD_EXTENSION_MINUTES,
  rangeProblem,
} from '../../src/features/inventory/rules'
import { DB_URL, loadSeedContext, runLotteryEngine, signInAs, USERS, type Client } from './helpers'

const RIFA = 'Rifa Inventario Comun (pruebas)'
const RIFA_BORRADOR = 'Rifa Inventario Borrador (pruebas)'
const RIFA_LOTERIA = 'Rifa Inventario Loteria (pruebas)'
const RIFA_CERRADA = 'Rifa Inventario Cerrada (pruebas)'
const RIFA_ANCHA = 'Rifa Inventario Ancha (pruebas)'
const RIFAS = [RIFA, RIFA_BORRADOR, RIFA_LOTERIA, RIFA_CERRADA, RIFA_ANCHA]
const SLUG = 'pruebas-inventario-comun'

let db: PgClient
let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let owner: Client
let admin: Client
let seller1: Client
let seller2: Client
let otherOrgOwner: Client
let otherOrgSeller: Client

let raffleId: string
let draftRaffleId: string
let lotteryRaffleId: string
let closedRaffleId: string
let wideRaffleId: string
let clienteVendedor1: string
let clienteVendedor2: string

const programaciones: string[] = []

type Run = {
  outcome: string
  run_id: string
  raffle_id: string
  total_count: number
  processed_count: number
  created_count: number
  existing_count: number
  existing_generated_count: number
  status: string
}

type HoldRow = {
  outcome: string
  hold_id: string
  ticket_id: string
  daily_number: string
  weekly_number: string
  started_at: string
  expires_at: string
  extended: boolean
  is_active: boolean
  active_count: number
  max_active: number
}

// ---------------------------------------------------------------------------
// Ayudantes
// ---------------------------------------------------------------------------

async function nuevaRifa(
  nombre: string,
  status: string,
  desde = '2026-01-01',
  hasta = '2026-12-31',
  cifras: [2 | 3 | 4, 2 | 3 | 4] = [2, 2],
) {
  const { rows } = await db.query(
    `insert into raffles (organization_id, name, ticket_price, status, start_date, end_date, created_by,
                          number_group_count, first_group_name, first_group_digits,
                          second_group_name, second_group_digits)
     values ($1, $2, 120000, $3, $4, $5, $6, 2, 'Diario', $7, 'Semanal', $8) returning id`,
    [ctx.demoOrg.id, nombre, status, desde, hasta, ctx.ids.owner, cifras[0], cifras[1]],
  )
  return rows[0].id as string
}

async function nuevoCliente(sellerId: string, nombre: string): Promise<string> {
  const { rows } = await db.query(
    `insert into clients (organization_id, seller_id, name, phone)
     values ($1, $2, $3, '3001112233') returning id`,
    [ctx.demoOrg.id, sellerId, nombre],
  )
  return rows[0].id as string
}

async function empezar(
  client: Client,
  raffle: string,
  daily: [string, string],
  weekly: [string, string],
  requestId: string = crypto.randomUUID(),
) {
  return client.rpc('admin_start_ticket_generation', {
    p_raffle_id: raffle,
    p_daily_from: daily[0],
    p_daily_to: daily[1],
    p_weekly_from: weekly[0],
    p_weekly_to: weekly[1],
    p_request_id: requestId,
  })
}

/** Una generacion completa, bloque a bloque, como la pantalla. */
async function generar(
  client: Client,
  raffle: string,
  daily: [string, string],
  weekly: [string, string],
): Promise<Run> {
  const { data, error } = await empezar(client, raffle, daily, weekly)
  if (error) throw new Error(`No se pudo empezar la generacion: ${error.message}`)
  let run = data![0] as Run
  while (run.status !== 'completed') {
    const next = await client.rpc('admin_process_ticket_generation', {
      p_run_id: run.run_id,
      p_processed_count: run.processed_count,
    })
    if (next.error) throw new Error(`No se pudo procesar un bloque: ${next.error.message}`)
    run = next.data![0] as Run
  }
  return run
}

type Boleta = {
  id: string
  seller_id: string | null
  client_id: string | null
  inventory_status: string
  sale_price: number | null
  paid_amount: number
  generation_run_id: string | null
}

async function boleta(raffle: string, daily: string, weekly: string): Promise<Boleta> {
  const { rows } = await db.query<Boleta>(
    `select id, seller_id, client_id, inventory_status, sale_price::int, paid_amount::int, generation_run_id
       from tickets where raffle_id = $1 and daily_number = $2 and weekly_number = $3`,
    [raffle, daily, weekly],
  )
  if (!rows[0]) throw new Error(`No existe la boleta ${daily}/${weekly}`)
  return rows[0]
}

/** Los ids de varias boletas en UNA consulta y en el orden pedido: nada de consultas en paralelo
 *  sobre la misma conexion, que `pg` 9 dejara de admitir. */
async function idsDe(raffle: string, combos: [string, string][]): Promise<string[]> {
  const { rows } = await db.query<{ id: string; combo: string }>(
    `select id, daily_number || '/' || weekly_number as combo
       from tickets
      where raffle_id = $1 and daily_number || '/' || weekly_number = any($2::text[])`,
    [raffle, combos.map(([d, w]) => `${d}/${w}`)],
  )
  const porCombo = new Map(rows.map((r) => [r.combo, r.id]))
  return combos.map(([d, w]) => {
    const id = porCombo.get(`${d}/${w}`)
    if (!id) throw new Error(`No existe la boleta ${d}/${w}`)
    return id
  })
}

async function apartar(client: Client, ticketId: string, requestId: string = crypto.randomUUID()) {
  return client.rpc('take_ticket_hold', { p_ticket_id: ticketId, p_request_id: requestId })
}

/** Mueve el reloj de un apartado hacia atras: queda vencido hace un minuto. */
async function vencer(holdId: string) {
  await db.query(
    `update ticket_holds
        set started_at = now() - interval '31 minutes',
            expires_at = now() - interval '1 minute',
            extended_at = null
      where id = $1`,
    [holdId],
  )
}

async function apartadoVigente(ticketId: string) {
  const { rows } = await db.query(
    `select id, seller_id from ticket_holds
      where ticket_id = $1 and ended_at is null and expires_at > now()`,
    [ticketId],
  )
  return rows[0] as { id: string; seller_id: string } | undefined
}

async function ajustes(client: Client, minutos: number, cupo: number, raffle = raffleId) {
  return client.rpc('set_raffle_hold_settings', {
    p_raffle_id: raffle,
    p_duration_minutes: minutos,
    p_max_active_per_seller: cupo,
  })
}

/** Cierra todos los apartados abiertos de la rifa: cada prueba parte de cero. */
async function sinApartados() {
  await db.query(
    `update ticket_holds set ended_at = least(now(), expires_at), end_reason = 'returned'
      where raffle_id = $1 and ended_at is null`,
    [raffleId],
  )
}

async function limpiar() {
  const { rows } = await db.query<{ id: string }>(
    'select id from raffles where organization_id = $1 and name = any($2::text[])',
    [ctx.demoOrg.id, RIFAS],
  )
  const rifas = rows.map((row) => row.id)
  // Lo que se va a borrar, apuntado ANTES: despues se borra su bitacora (D-233),
  // tambien la que escribe el propio borrado.
  const { rows: boletas } = await db.query<{ id: string }>(
    'select id from tickets where raffle_id = any($1::uuid[])',
    [rifas],
  )
  const { rows: otras } = await db.query<{ id: string }>(
    `select id from ticket_generation_runs where raffle_id = any($1::uuid[])
     union all
     select id from clients where name like 'Inventario prueba%'
     union all
     select id from payments
      where client_id in (select id from clients where name like 'Inventario prueba%')`,
    [rifas],
  )
  const ticketIds = boletas.map((row) => row.id)
  const entidades = [...rifas, ...ticketIds, ...otras.map((row) => row.id)]
  await db.query('begin')
  try {
    await db.query(
      `update memberships set public_slug = null, public_catalog_enabled = false,
              public_whatsapp_number = null, public_raffle_id = null
        where public_slug = $1`,
      [SLUG],
    )
    if (rifas.length > 0) {
      // Una coincidencia es inmutable (BR-L11): su disparador se apaga SOLO
      // dentro de esta transaccion de limpieza y se vuelve a encender antes del
      // commit; un rollback lo restituye igual.
      await db.query(
        'alter table lottery_ticket_matches disable trigger lottery_ticket_matches_immutable',
      )
      await db.query('delete from lottery_ticket_matches where raffle_id = any($1::uuid[])', [
        rifas,
      ])
      await db.query(
        'alter table lottery_ticket_matches enable trigger lottery_ticket_matches_immutable',
      )
      await db.query(
        `delete from notifications where entity_id in
           (select id from tickets where raffle_id = any($1::uuid[]))`,
        [rifas],
      )
      await db.query('delete from ticket_holds where raffle_id = any($1::uuid[])', [rifas])
      await db.query(
        `delete from payment_allocations where ticket_id in
           (select id from tickets where raffle_id = any($1::uuid[]))`,
        [rifas],
      )
      await db.query(
        `delete from payments p where not exists
           (select 1 from payment_allocations pa where pa.payment_id = p.id)
           and p.client_id in (select id from clients where name like 'Inventario prueba%')`,
      )
      await db.query('delete from tickets where raffle_id = any($1::uuid[])', [rifas])
      await db.query('delete from ticket_generation_runs where raffle_id = any($1::uuid[])', [
        rifas,
      ])
      await db.query('delete from raffle_hold_settings where raffle_id = any($1::uuid[])', [rifas])
      await db.query('delete from commission_ledger where raffle_id = any($1::uuid[])', [rifas])
      await db.query('delete from seller_commissions where raffle_id = any($1::uuid[])', [rifas])
      await db.query('delete from raffles where id = any($1::uuid[])', [rifas])
    }
    await db.query("delete from clients where name like 'Inventario prueba%'")
    // El sorteo de la suite, por su fecha propia: tambien el que dejara una
    // ejecucion anterior interrumpida (las programaciones son nacionales).
    await db.query(
      `delete from lottery_results where schedule_id in
         (select id from lottery_draw_schedules
           where lottery_code = 'bogota' and reference_date = '2091-07-19')
          or schedule_id = any($1::uuid[])`,
      [programaciones],
    )
    await db.query(
      `delete from lottery_draw_schedules
        where (lottery_code = 'bogota' and reference_date = '2091-07-19') or id = any($1::uuid[])`,
      [programaciones],
    )
    // La bitacora de todo lo anterior. Los lotes se anotan sin entidad: los de
    // entregar, recuperar o anular nombran sus boletas, y los de crear en lote,
    // su rifa; esos se eligen por eso.
    await db.query('delete from audit_logs where entity_id = any($1::uuid[])', [entidades])
    await db.query(
      `delete from audit_logs a
        where a.entity_id is null
          and (a.new_values ->> 'raffle_id' = any($2::text[])
               or (a.new_values ? 'ticket_ids'
                   and exists (select 1
                                 from jsonb_array_elements_text(a.new_values -> 'ticket_ids') e(v)
                                where e.v = any($1::text[]))))`,
      [ticketIds, rifas],
    )
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  }
}

beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  ctx = await loadSeedContext()
  ;[owner, admin, seller1, seller2, otherOrgOwner, otherOrgSeller] = await Promise.all([
    signInAs(USERS.owner),
    signInAs(USERS.admin),
    signInAs(USERS.seller1),
    signInAs(USERS.seller2),
    signInAs(USERS.otherOrgOwner),
    signInAs(USERS.otherOrgSeller),
  ])
  await limpiar()
  raffleId = await nuevaRifa(RIFA, 'active')
  draftRaffleId = await nuevaRifa(RIFA_BORRADOR, 'draft')
  // Fechas propias: el motor mira TODAS las rifas que participan en la fecha.
  lotteryRaffleId = await nuevaRifa(RIFA_LOTERIA, 'active', '2091-07-01', '2091-07-31', [4, 4])
  closedRaffleId = await nuevaRifa(RIFA_CERRADA, 'closed')
  wideRaffleId = await nuevaRifa(RIFA_ANCHA, 'active', '2026-01-01', '2026-12-31', [4, 2])
  clienteVendedor1 = await nuevoCliente(ctx.ids.seller1, 'Inventario prueba Uno')
  clienteVendedor2 = await nuevoCliente(ctx.ids.seller2, 'Inventario prueba Dos')
}, 120_000)

afterAll(async () => {
  // Por si una prueba dejo a vendedor2 inactivo a mitad de camino.
  await db.query(
    'update memberships set is_active = true where profile_id = $1 and organization_id = $2',
    [ctx.ids.seller2, ctx.demoOrg.id],
  )
  await limpiar()
  await db.end()
})

// ===========================================================================
// Espejo de las reglas: SQL y TypeScript dicen lo mismo
// ===========================================================================

describe('las reglas de la base y las de la pantalla son las mismas', () => {
  it('constantes de apartados y del generador', async () => {
    const { rows } = await db.query(
      `select ticket_hold_default_minutes() as minutos, ticket_hold_default_max_active() as cupo,
              ticket_hold_extension_minutes() as extension, ticket_generation_max() as maximo`,
    )
    expect(rows[0]).toEqual({
      minutos: HOLD_DEFAULT_MINUTES,
      cupo: HOLD_DEFAULT_MAX_ACTIVE,
      extension: HOLD_EXTENSION_MINUTES,
      maximo: GENERATION_MAX,
    })
  })

  it('las frases de un rango que no vale, letra por letra', async () => {
    const casos: [string, string][] = [
      ['', '99'],
      ['00', ''],
      ['1A', '99'],
      ['12345', '1'],
      ['-1', '9'],
      ['0', '99'],
      ['007', '10'],
      ['09', '01'],
      ['00', '99'],
      ['007', '010'],
      ['9999', '9999'],
    ]
    for (const [desde, hasta] of casos) {
      const { rows } = await db.query('select ticket_generation_range_problem($1, $2) as frase', [
        desde,
        hasta,
      ])
      expect(rows[0].frase, `${desde}–${hasta}`).toBe(rangeProblem(desde, hasta))
    }
  })
})

// ===========================================================================
// El generador por rangos (BR-N15..BR-N18)
// ===========================================================================

describe('generador por rangos', () => {
  it('crea todas las combinaciones, en orden, sin vendedor y con el ancho escrito', async () => {
    const run = await generar(owner, raffleId, ['00', '02'], ['10', '11'])
    expect(run).toMatchObject({
      total_count: 6,
      created_count: 6,
      existing_count: 0,
      status: 'completed',
    })

    const { rows } = await db.query(
      `select daily_number || '/' || weekly_number as combo, seller_id, inventory_status,
              internal_code
         from tickets where generation_run_id = $1 order by internal_code`,
      [run.run_id],
    )
    expect(rows.map((r) => r.combo)).toEqual(['00/10', '00/11', '01/10', '01/11', '02/10', '02/11'])
    expect(rows.every((r) => r.seller_id === null && r.inventory_status === 'available')).toBe(true)
    expect(new Set(rows.map((r) => r.internal_code)).size).toBe(6)
  })

  it('el ancho lo pone la rifa: del 7 al 10, con dos cifras, son 07, 08, 09 y 10 (D-261)', async () => {
    const run = await generar(owner, raffleId, ['7', '10'], ['5', '5'])
    const { rows } = await db.query(
      `select daily_number, weekly_number from tickets where generation_run_id = $1
        order by daily_number`,
      [run.run_id],
    )
    expect(rows).toEqual([
      { daily_number: '07', weekly_number: '05' },
      { daily_number: '08', weekly_number: '05' },
      { daily_number: '09', weekly_number: '05' },
      { daily_number: '10', weekly_number: '05' },
    ])
  })

  it('rechaza un rango con mas cifras que su numero, con letras o al reves, con las frases del formulario', async () => {
    // D-261: un ancho distinto en los dos extremos ya no es un error —la rifa
    // pone el ancho—; lo es pasarse de las cifras del número.
    const ancho = await empezar(owner, raffleId, ['0', '100'], ['00', '01'])
    expect(ancho.error?.message).toBe(GROUP_RANGE_MESSAGES.tooLong('Diario', 2))
    const letras = await empezar(owner, raffleId, ['00', '01'], ['1A', '99'])
    expect(letras.error?.message).toBe(GROUP_RANGE_MESSAGES.format('Semanal'))
    const reves = await empezar(owner, raffleId, ['09', '01'], ['00', '01'])
    expect(reves.error?.message).toBe(GROUP_RANGE_MESSAGES.order('Diario'))
  })

  it('rechaza mas de 100.000 combinaciones y lo explica', async () => {
    const { error } = await empezar(owner, wideRaffleId, ['0000', '9999'], ['00', '10'])
    expect(error?.message).toBe(
      'Esos rangos dan 110.000 combinaciones. El generador crea hasta 100.000 de una vez: acorta uno de los dos rangos.',
    )
  })

  it('no toca lo que ya existia —ni las anuladas— y distingue lo que creo otra generacion', async () => {
    // Dos combinaciones del vendedor1, una de ellas anulada.
    const creadas = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: raffleId,
      p_seller_id: ctx.ids.seller1,
      p_rows: [
        { daily_number: '20', weekly_number: '30' },
        { daily_number: '21', weekly_number: '30' },
      ],
    })
    expect(creadas.error).toBeNull()
    const anulable = await boleta(raffleId, '21', '30')
    const anulada = await owner.rpc('bulk_cancel_tickets', {
      p_ticket_ids: [anulable.id],
      p_reason: 'Prueba de inventario',
    })
    expect(anulada.error).toBeNull()

    const a = await generar(owner, raffleId, ['20', '22'], ['30', '31'])
    expect(a).toMatchObject({
      total_count: 6,
      created_count: 4,
      existing_count: 2,
      existing_generated_count: 0,
    })
    expect(await boleta(raffleId, '20', '30')).toMatchObject({
      seller_id: ctx.ids.seller1,
      inventory_status: 'available',
      generation_run_id: null,
    })
    expect(await boleta(raffleId, '21', '30')).toMatchObject({ inventory_status: 'cancelled' })

    // La vista previa de una segunda generacion mas ancha: cuenta, no escribe.
    const antes = await db.query('select count(*)::int as n from ticket_generation_runs')
    const vista = await owner.rpc('admin_ticket_generation_preview', {
      p_raffle_id: raffleId,
      p_daily_from: '20',
      p_daily_to: '23',
      p_weekly_from: '30',
      p_weekly_to: '31',
    })
    expect(vista.data![0]).toMatchObject({
      total_count: 8,
      existing_count: 6,
      existing_generated_count: 4,
    })
    const despues = await db.query('select count(*)::int as n from ticket_generation_runs')
    expect(despues.rows[0].n).toBe(antes.rows[0].n)

    const b = await generar(owner, raffleId, ['20', '23'], ['30', '31'])
    expect(b).toMatchObject({
      total_count: 8,
      created_count: 2,
      existing_count: 6,
      existing_generated_count: 4,
    })

    // Las que ya existian, paginadas.
    const pagina1 = await owner.rpc('admin_ticket_generation_existing', {
      p_run_id: b.run_id,
      p_limit: 4,
      p_offset: 0,
    })
    const pagina2 = await owner.rpc('admin_ticket_generation_existing', {
      p_run_id: b.run_id,
      p_limit: 4,
      p_offset: 4,
    })
    expect(pagina1.data).toHaveLength(4)
    expect(pagina2.data).toHaveLength(2)
    expect(Number(pagina1.data![0]!.total_count)).toBe(6)
    const todas = [...pagina1.data!, ...pagina2.data!]
    expect(todas.filter((r) => r.other_generation)).toHaveLength(4)
    expect(todas.filter((r) => !r.other_generation)).toHaveLength(2)
  })

  it('la misma solicitud devuelve la misma generacion y un bloque repetido no duplica nada', async () => {
    const requestId = crypto.randomUUID()
    const primera = await empezar(owner, raffleId, ['40', '41'], ['50', '51'], requestId)
    const segunda = await empezar(owner, raffleId, ['40', '41'], ['50', '51'], requestId)
    expect(segunda.data![0]!.run_id).toBe(primera.data![0]!.run_id)
    expect(segunda.data![0]!.outcome).toBe('existing_request')

    const otra = await empezar(owner, raffleId, ['40', '42'], ['50', '51'], requestId)
    expect(otra.error?.message).toBe(
      'Esta solicitud ya se usó para otra generación. Vuelve a abrir el generador.',
    )

    const runId = primera.data![0]!.run_id
    const bloque = await owner.rpc('admin_process_ticket_generation', {
      p_run_id: runId,
      p_processed_count: 0,
    })
    expect(bloque.data![0]).toMatchObject({ outcome: 'completed', created_count: 4 })
    // La respuesta se perdio y la pantalla repite: nada cambia.
    const repetido = await owner.rpc('admin_process_ticket_generation', {
      p_run_id: runId,
      p_processed_count: 0,
    })
    expect(repetido.data![0]).toMatchObject({ outcome: 'completed', created_count: 4 })
    const { rows } = await db.query(
      'select count(*)::int as n from tickets where generation_run_id = $1',
      [runId],
    )
    expect(rows[0].n).toBe(4)
  })

  it('una generacion igual que quedo a medias se continua, no se duplica', async () => {
    // 100 x 60 = 6.000: dos bloques de 5.000.
    const inicio = await empezar(owner, wideRaffleId, ['0000', '0099'], ['00', '59'])
    const run = inicio.data![0]!
    expect(run.total_count).toBe(6000)
    const bloque = await owner.rpc('admin_process_ticket_generation', {
      p_run_id: run.run_id,
      p_processed_count: 0,
    })
    expect(bloque.data![0]).toMatchObject({ outcome: 'processed', processed_count: 5000 })

    // La pestaña se cerro. Al volver, la misma generacion con OTRA solicitud.
    const vuelta = await empezar(owner, wideRaffleId, ['0000', '0099'], ['00', '59'])
    expect(vuelta.data![0]).toMatchObject({
      outcome: 'resumed',
      run_id: run.run_id,
      processed_count: 5000,
    })

    // Un avance mas alto que el guardado es imposible: se rechaza.
    const adelantado = await owner.rpc('admin_process_ticket_generation', {
      p_run_id: run.run_id,
      p_processed_count: 5500,
    })
    expect(adelantado.error?.message).toBe(
      'El avance de la generación no coincide con lo guardado. Vuelve a abrirla para continuar.',
    )

    const fin = await owner.rpc('admin_process_ticket_generation', {
      p_run_id: run.run_id,
      p_processed_count: 5000,
    })
    expect(fin.data![0]).toMatchObject({
      outcome: 'completed',
      created_count: 6000,
      processed_count: 6000,
    })

    // UNA fila de bitacora por bloque y ninguna `ticket.create` por boleta.
    const bitacora = await db.query(
      `select count(*) filter (where action = 'ticket.generate')::int as bloques,
              count(*) filter (where action = 'ticket.create'
                                 and new_values ->> 'generation_run_id' = $1)::int as boletas
         from audit_logs where entity_id = $1::uuid or new_values ->> 'generation_run_id' = $1`,
      [run.run_id],
    )
    expect(bitacora.rows[0]).toEqual({ bloques: 2, boletas: 0 })
  })

  it('solo el personal genera, y solo en su organizacion y en rifas abiertas', async () => {
    const vendedor = await empezar(seller1, raffleId, ['60', '61'], ['00', '01'])
    expect(vendedor.error?.message).toBe('La rifa no existe o no tienes acceso a ella.')

    const ajeno = await empezar(otherOrgOwner, raffleId, ['60', '61'], ['00', '01'])
    expect(ajeno.error?.message).toBe('La rifa no existe o no tienes acceso a ella.')

    const cerrada = await empezar(owner, closedRaffleId, ['60', '61'], ['00', '01'])
    expect(cerrada.error?.message).toBe('La rifa está cerrada y ya no admite boletas nuevas.')

    const { data: corridas } = await otherOrgOwner.rpc('admin_ticket_generation_runs', {
      p_raffle_id: raffleId,
    })
    expect(corridas).toEqual([])
  })

  it('una sesion no puede crear boletas del inventario comun ni marcar una generacion a mano', async () => {
    const sinVendedor = await owner.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: raffleId,
      seller_id: null,
      created_by: ctx.ids.owner,
      daily_number: '79',
      weekly_number: '79',
      inventory_status: 'available',
    })
    expect(sinVendedor.error?.code).toBe('42501')

    const { rows } = await db.query(
      'select id from ticket_generation_runs where raffle_id = $1 limit 1',
      [raffleId],
    )
    const conGeneracion = await owner.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: raffleId,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: '78',
      weekly_number: '78',
      inventory_status: 'available',
      generation_run_id: rows[0].id,
    })
    expect(conGeneracion.error?.code).toBe('42501')
  })
})

// ===========================================================================
// Asignar y recuperar lotes (BR-I18, BR-I19)
// ===========================================================================

describe('asignar a un vendedor y recuperar al inventario comun', () => {
  it('asigna sin vencimiento ni cupo, y repetirla no cambia nada', async () => {
    const run = await generar(owner, raffleId, ['70', '72'], ['00', '00'])
    expect(run.created_count).toBe(3)
    const ids = await idsDe(raffleId, [
      ['70', '00'],
      ['71', '00'],
      ['72', '00'],
    ])

    const asignadas = await owner.rpc('admin_assign_inventory_tickets', {
      p_ticket_ids: ids,
      p_seller_id: ctx.ids.seller2,
    })
    expect(asignadas.data).toEqual({ requested: 3, assigned: 3, already: 0 })
    for (const id of ids) {
      const { rows } = await db.query('select seller_id from tickets where id = $1', [id])
      expect(rows[0].seller_id).toBe(ctx.ids.seller2)
    }

    const repetida = await owner.rpc('admin_assign_inventory_tickets', {
      p_ticket_ids: ids,
      p_seller_id: ctx.ids.seller2,
    })
    expect(repetida.data).toEqual({ requested: 3, assigned: 0, already: 3 })

    // El vendedor las ve como suyas, y no le cuentan como apartados.
    const { count } = await seller2
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .in('id', ids)
    expect(count).toBe(3)
    const { data: resumen } = await seller2.rpc('seller_inventory_summary')
    expect(resumen!.find((r) => r.raffle_id === raffleId)?.my_active_holds).toBe(0)
  })

  it('todo o nada: una apartada hace que no se asigne ninguna', async () => {
    await generar(owner, raffleId, ['73', '74'], ['00', '00'])
    const libre = await boleta(raffleId, '73', '00')
    const apartada = await boleta(raffleId, '74', '00')
    expect((await apartar(seller1, apartada.id)).error).toBeNull()

    const { error } = await owner.rpc('admin_assign_inventory_tickets', {
      p_ticket_ids: [libre.id, apartada.id],
      p_seller_id: ctx.ids.seller2,
    })
    expect(error?.message).toBe(
      'No se realizó ningún cambio: 1 de las 2 boletas seleccionadas ya no están libres en el inventario común.',
    )
    expect((await boleta(raffleId, '73', '00')).seller_id).toBeNull()
    await sinApartados()
  })

  it('recupera solo las disponibles sin vender y no toca ventas, clientes ni abonos', async () => {
    await generar(owner, raffleId, ['75', '77'], ['00', '00'])
    const ids = await idsDe(raffleId, [
      ['75', '00'],
      ['76', '00'],
      ['77', '00'],
    ])
    await owner.rpc('admin_assign_inventory_tickets', {
      p_ticket_ids: ids,
      p_seller_id: ctx.ids.seller1,
    })

    // El vendedor vende una y le abonan una parte.
    const venta = await seller1.rpc('bulk_assign_tickets', {
      p_ticket_ids: [ids[0]!],
      p_client_id: clienteVendedor1,
    })
    expect(venta.error).toBeNull()
    const abono = await seller1.rpc('create_payment', {
      p_client_id: clienteVendedor1,
      p_total_amount: 40_000,
      p_allocations: [{ ticket_id: ids[0], amount: 40_000 }],
    })
    expect(abono.error).toBeNull()

    const conVendida = await owner.rpc('admin_recover_inventory_tickets', { p_ticket_ids: ids })
    expect(conVendida.error?.message).toBe(
      'No se realizó ningún cambio: 1 de las 3 boletas seleccionadas ya no se pueden recuperar. Solo vuelven al inventario común las disponibles, sin vender.',
    )

    const recuperadas = await owner.rpc('admin_recover_inventory_tickets', {
      p_ticket_ids: [ids[1]!, ids[2]!],
    })
    expect(recuperadas.data).toEqual({ requested: 2, recovered: 2, already: 0 })
    expect((await boleta(raffleId, '76', '00')).seller_id).toBeNull()
    expect(await boleta(raffleId, '75', '00')).toMatchObject({
      seller_id: ctx.ids.seller1,
      client_id: clienteVendedor1,
      inventory_status: 'assigned',
      sale_price: 120_000,
      paid_amount: 40_000,
    })
  })

  it('una venta y una recuperacion a la vez nunca terminan las dos', async () => {
    const run = await generar(owner, raffleId, ['80', '85'], ['00', '00'])
    expect(run.created_count).toBe(6)
    const resultados = { venta: 0, recuperacion: 0 }
    for (const d of ['80', '81', '82', '83', '84', '85']) {
      const t = await boleta(raffleId, d, '00')
      await owner.rpc('admin_assign_inventory_tickets', {
        p_ticket_ids: [t.id],
        p_seller_id: ctx.ids.seller1,
      })

      const [venta, recuperacion] = await Promise.all([
        seller1.rpc('bulk_assign_tickets', { p_ticket_ids: [t.id], p_client_id: clienteVendedor1 }),
        owner.rpc('admin_recover_inventory_tickets', { p_ticket_ids: [t.id] }),
      ])
      const final = await boleta(raffleId, d, '00')
      // Exactamente una de las dos.
      expect([venta.error === null, recuperacion.error === null].filter(Boolean)).toHaveLength(1)
      if (venta.error === null) {
        resultados.venta += 1
        expect(final).toMatchObject({
          seller_id: ctx.ids.seller1,
          client_id: clienteVendedor1,
          inventory_status: 'assigned',
        })
      } else {
        resultados.recuperacion += 1
        expect(final).toMatchObject({
          seller_id: null,
          client_id: null,
          inventory_status: 'available',
        })
      }
    }
    expect(resultados.venta + resultados.recuperacion).toBe(6)
  })

  it('el vendedor no asigna ni recupera, y otra organizacion no toca nada', async () => {
    await generar(owner, raffleId, ['86', '86'], ['00', '00'])
    const t = await boleta(raffleId, '86', '00')
    const vendedor = await seller1.rpc('admin_assign_inventory_tickets', {
      p_ticket_ids: [t.id],
      p_seller_id: ctx.ids.seller1,
    })
    expect(vendedor.error?.message).toBe('La boleta no existe o no tienes acceso a ella.')
    const ajeno = await otherOrgOwner.rpc('admin_assign_inventory_tickets', {
      p_ticket_ids: [t.id],
      p_seller_id: ctx.ids.otherOrgSeller,
    })
    expect(ajeno.error?.message).toBe('La boleta no existe o no tienes acceso a ella.')
    const recuperar = await seller2.rpc('admin_recover_inventory_tickets', { p_ticket_ids: [t.id] })
    expect(recuperar.error?.message).toBe('La boleta no existe o no tienes acceso a ella.')
    expect((await boleta(raffleId, '86', '00')).seller_id).toBeNull()
  })

  it('«Cambiar vendedor» ya no da por movida una boleta del inventario comun', async () => {
    const t = await boleta(raffleId, '86', '00')
    const { error } = await owner.rpc('bulk_change_ticket_seller', {
      p_ticket_ids: [t.id],
      p_seller_id: ctx.ids.seller1,
    })
    expect(error?.message).toBe(
      'No se realizó ningún cambio: 1 de las 1 boletas seleccionadas ya no pueden cambiar de vendedor.',
    )
    expect((await boleta(raffleId, '86', '00')).seller_id).toBeNull()
  })

  it('una apartada no se anula, no se elimina ni cambia de numeros; devuelta, si', async () => {
    await generar(owner, raffleId, ['87', '87'], ['00', '00'])
    const t = await boleta(raffleId, '87', '00')
    const hold = await apartar(seller1, t.id)
    expect(hold.error).toBeNull()

    const anular = await owner.rpc('bulk_cancel_tickets', {
      p_ticket_ids: [t.id],
      p_reason: 'Prueba',
    })
    expect(anular.error?.message).toBe(
      'Esta boleta está apartada por un vendedor. Espera a que la venda, la devuelva o venza el apartado.',
    )
    const eliminar = await owner.rpc('bulk_delete_tickets', {
      p_ticket_ids: [t.id],
      p_reason: 'Prueba',
    })
    expect(eliminar.error?.message).toBe(
      'Esta boleta está apartada por un vendedor. Espera a que la venda, la devuelva o venza el apartado.',
    )
    const numeros = await owner.rpc('admin_update_ticket_numbers', {
      p_ticket_id: t.id,
      p_daily_number: '88',
      p_weekly_number: '01',
    })
    expect(numeros.error?.message).toBe(
      'Esta boleta está apartada por un vendedor. Espera a que la venda, la devuelva o venza el apartado.',
    )

    await seller1.rpc('return_ticket_hold', { p_hold_id: hold.data![0]!.hold_id })
    const despues = await owner.rpc('bulk_cancel_tickets', {
      p_ticket_ids: [t.id],
      p_reason: 'Prueba',
    })
    expect(despues.error).toBeNull()
    expect(await boleta(raffleId, '87', '00')).toMatchObject({
      seller_id: null,
      inventory_status: 'cancelled',
    })
  })
})

// ===========================================================================
// Los apartados (BR-I20..BR-I26)
// ===========================================================================

describe('apartados temporales', () => {
  it('el plazo empieza cuando la base confirma y dura lo de la rifa', async () => {
    await generar(owner, raffleId, ['90', '90'], ['00', '00'])
    const t = await boleta(raffleId, '90', '00')
    const { data, error } = await apartar(seller1, t.id)
    expect(error).toBeNull()
    const h = data![0] as HoldRow
    expect(h).toMatchObject({ outcome: 'taken', is_active: true, extended: false, active_count: 1 })
    const minutos = (Date.parse(h.expires_at) - Date.parse(h.started_at)) / 60_000
    expect(minutos).toBe(HOLD_DEFAULT_MINUTES)
    expect(Math.abs(Date.parse(h.started_at) - Date.now())).toBeLessThan(60_000)
    await sinApartados()
  })

  it('dos vendedores a la vez sobre la misma boleta: se la queda uno solo', async () => {
    await generar(owner, raffleId, ['91', '91'], ['00', '00'])
    const t = await boleta(raffleId, '91', '00')
    const [a, b] = await Promise.all([apartar(seller1, t.id), apartar(seller2, t.id)])
    const ganadores = [a, b].filter((r) => r.error === null)
    expect(ganadores).toHaveLength(1)
    const perdedor = [a, b].find((r) => r.error !== null)!
    expect(perdedor.error!.message).toBe('Esta boleta ya no está disponible. Busca otra libre.')
    const { rows } = await db.query(
      'select count(*)::int as n from ticket_holds where ticket_id = $1',
      [t.id],
    )
    expect(rows[0].n).toBe(1)
    await sinApartados()
  })

  it('muchas solicitudes simultaneas del mismo vendedor no pasan su cupo', async () => {
    expect((await ajustes(owner, 30, 3)).error).toBeNull()
    await generar(owner, raffleId, ['92', '92'], ['00', '07'])
    const ids = await idsDe(
      raffleId,
      Array.from({ length: 8 }, (_, i): [string, string] => ['92', `0${i}`]),
    )
    const respuestas = await Promise.all(ids.map((id) => apartar(seller1, id)))
    const tomadas = respuestas.filter((r) => r.error === null)
    expect(tomadas).toHaveLength(3)
    for (const r of respuestas.filter((r) => r.error !== null)) {
      expect(r.error!.message).toBe(
        'Ya tienes 3 boletas apartadas en esta rifa, que es el máximo. Vende o devuelve alguna para apartar otra.',
      )
    }
    const { rows } = await db.query(
      `select count(*)::int as n from ticket_holds
        where raffle_id = $1 and seller_id = $2 and ended_at is null and expires_at > now()`,
      [raffleId, ctx.ids.seller1],
    )
    expect(rows[0].n).toBe(3)
    await sinApartados()
    await ajustes(owner, HOLD_DEFAULT_MINUTES, HOLD_DEFAULT_MAX_ACTIVE)
  })

  it('repetir la misma solicitud devuelve el mismo apartado y no reinicia el plazo', async () => {
    await generar(owner, raffleId, ['93', '93'], ['00', '00'])
    const t = await boleta(raffleId, '93', '00')
    const requestId = crypto.randomUUID()
    const [a, b] = await Promise.all([
      apartar(seller1, t.id, requestId),
      apartar(seller1, t.id, requestId),
    ])
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect(a.data![0]!.hold_id).toBe(b.data![0]!.hold_id)
    expect(a.data![0]!.expires_at).toBe(b.data![0]!.expires_at)
    expect([a.data![0]!.outcome, b.data![0]!.outcome].sort()).toEqual([
      'already_requested',
      'taken',
    ])

    // Otra pestaña, otra solicitud: el mismo apartado, con el mismo vencimiento.
    const otraPestana = await apartar(seller1, t.id)
    expect(otraPestana.data![0]).toMatchObject({
      outcome: 'already_mine',
      hold_id: a.data![0]!.hold_id,
      expires_at: a.data![0]!.expires_at,
    })
    await sinApartados()
  })

  it('una sola extension de 30 minutos, sumada al vencimiento vigente', async () => {
    await generar(owner, raffleId, ['94', '94'], ['00', '00'])
    const t = await boleta(raffleId, '94', '00')
    const h = (await apartar(seller1, t.id)).data![0] as HoldRow
    const extendida = await seller1.rpc('extend_ticket_hold', { p_hold_id: h.hold_id })
    expect(extendida.data![0]!.outcome).toBe('extended')
    expect((Date.parse(extendida.data![0]!.expires_at) - Date.parse(h.expires_at)) / 60_000).toBe(
      HOLD_EXTENSION_MINUTES,
    )
    const otraVez = await seller1.rpc('extend_ticket_hold', { p_hold_id: h.hold_id })
    expect(otraVez.data![0]).toMatchObject({
      outcome: 'already_extended',
      expires_at: extendida.data![0]!.expires_at,
    })

    // Y uno vencido ya no se extiende.
    await vencer(h.hold_id)
    const vencida = await seller1.rpc('extend_ticket_hold', { p_hold_id: h.hold_id })
    expect(vencida.error?.message).toBe(
      'Este apartado ya terminó. Si la boleta sigue libre, vuelve a apartarla.',
    )
    await sinApartados()
  })

  it('devolver libera en el acto, el mismo vendedor la aparta enseguida y lo antiguo no toca lo nuevo', async () => {
    await generar(owner, raffleId, ['95', '95'], ['00', '00'])
    const t = await boleta(raffleId, '95', '00')
    const h1 = (await apartar(seller1, t.id)).data![0] as HoldRow
    const devuelta = await seller1.rpc('return_ticket_hold', { p_hold_id: h1.hold_id })
    expect(devuelta.data![0]!.outcome).toBe('returned')
    expect(await apartadoVigente(t.id)).toBeUndefined()

    const h2 = (await apartar(seller1, t.id)).data![0] as HoldRow
    expect(h2.outcome).toBe('taken')
    expect(h2.hold_id).not.toBe(h1.hold_id)

    // Una pantalla vieja con el apartado anterior.
    expect(
      (await seller1.rpc('extend_ticket_hold', { p_hold_id: h1.hold_id })).error?.message,
    ).toBe('Este apartado ya terminó. Si la boleta sigue libre, vuelve a apartarla.')
    expect(
      (await seller1.rpc('return_ticket_hold', { p_hold_id: h1.hold_id })).data![0]!.outcome,
    ).toBe('already_ended')
    const ventaVieja = await seller1.rpc('sell_ticket_hold', {
      p_hold_id: h1.hold_id,
      p_client_id: clienteVendedor1,
    })
    expect(ventaVieja.error?.message).toBe(
      'Este apartado ya terminó. Si la boleta sigue libre, vuelve a apartarla para venderla.',
    )
    expect((await apartadoVigente(t.id))?.id).toBe(h2.hold_id)

    // Con el vigente, se vende: la boleta pasa al vendedor y el cupo se libera.
    const venta = await seller1.rpc('sell_ticket_hold', {
      p_hold_id: h2.hold_id,
      p_client_id: clienteVendedor1,
    })
    expect(venta.error).toBeNull()
    expect(await boleta(raffleId, '95', '00')).toMatchObject({
      seller_id: ctx.ids.seller1,
      client_id: clienteVendedor1,
      inventory_status: 'assigned',
      sale_price: 120_000,
    })
    const { rows } = await db.query('select end_reason from ticket_holds where id = $1', [
      h2.hold_id,
    ])
    expect(rows[0].end_reason).toBe('sold')
    // Repetir la venta tras la respuesta perdida: la misma boleta, nada mas.
    const repetida = await seller1.rpc('sell_ticket_hold', {
      p_hold_id: h2.hold_id,
      p_client_id: clienteVendedor1,
    })
    expect(repetida.data).toBe(t.id)
  })

  it('con el apartado vencido no se vende, y otro vendedor puede apartarla', async () => {
    await generar(owner, raffleId, ['96', '96'], ['00', '00'])
    const t = await boleta(raffleId, '96', '00')
    const h = (await apartar(seller1, t.id)).data![0] as HoldRow
    await vencer(h.hold_id)

    const venta = await seller1.rpc('sell_ticket_hold', {
      p_hold_id: h.hold_id,
      p_client_id: clienteVendedor1,
    })
    expect(venta.error?.message).toBe(
      'El apartado de esta boleta venció. Si sigue libre, vuelve a apartarla para venderla.',
    )
    expect(await boleta(raffleId, '96', '00')).toMatchObject({ seller_id: null, client_id: null })

    const otro = await apartar(seller2, t.id)
    expect(otro.data![0]!.outcome).toBe('taken')
    const { rows } = await db.query('select end_reason from ticket_holds where id = $1', [
      h.hold_id,
    ])
    expect(rows[0].end_reason).toBe('expired')
    expect(
      (await seller1.rpc('return_ticket_hold', { p_hold_id: h.hold_id })).data![0]!.outcome,
    ).toBe('already_ended')
    expect((await apartadoVigente(t.id))?.seller_id).toBe(ctx.ids.seller2)
    await sinApartados()
  })

  it('la venta conserva sus reglas: con un cliente ajeno no vende y el apartado sigue', async () => {
    await generar(owner, raffleId, ['97', '97'], ['00', '00'])
    const t = await boleta(raffleId, '97', '00')
    const h = (await apartar(seller1, t.id)).data![0] as HoldRow
    const ajeno = await seller1.rpc('sell_ticket_hold', {
      p_hold_id: h.hold_id,
      p_client_id: clienteVendedor2,
    })
    expect(ajeno.error?.message).toBe('El cliente pertenece a otro vendedor.')
    expect((await apartadoVigente(t.id))?.id).toBe(h.hold_id)
    expect((await boleta(raffleId, '97', '00')).seller_id).toBeNull()

    // Ni otro vendedor puede usar el apartado ajeno.
    for (const accion of ['extend_ticket_hold', 'return_ticket_hold'] as const) {
      const { error } = await seller2.rpc(accion, { p_hold_id: h.hold_id })
      expect(error?.message).toBe('El apartado no existe o no es tuyo.')
    }
    const venta2 = await seller2.rpc('sell_ticket_hold', {
      p_hold_id: h.hold_id,
      p_client_id: clienteVendedor2,
    })
    expect(venta2.error?.message).toBe('El apartado no existe o no es tuyo.')

    // Ni vender la boleta sin apartarla.
    const directa = await seller1.rpc('assign_ticket', {
      p_ticket_id: t.id,
      p_client_id: clienteVendedor1,
    })
    expect(directa.error?.message).toBe('La boleta no existe o no tienes acceso a ella.')
    await sinApartados()
  })

  it('bajar el cupo conserva lo vigente y frena nuevas tomas; la duracion nueva vale para las nuevas', async () => {
    await generar(owner, raffleId, ['98', '98'], ['00', '04'])
    const ids = await idsDe(
      raffleId,
      Array.from({ length: 5 }, (_, i): [string, string] => ['98', `0${i}`]),
    )
    const tomadas: HoldRow[] = []
    for (const id of ids.slice(0, 3)) tomadas.push((await apartar(seller1, id)).data![0] as HoldRow)

    expect((await ajustes(owner, 45, 2)).error).toBeNull()
    expect(await apartadoVigente(ids[0]!)).toBeDefined()
    const frenada = await apartar(seller1, ids[3]!)
    expect(frenada.error?.message).toBe(
      'Ya tienes 3 boletas apartadas en esta rifa, que es el máximo. Vende o devuelve alguna para apartar otra.',
    )
    const { rows } = await db.query('select expires_at from ticket_holds where id = $1', [
      tomadas[0]!.hold_id,
    ])
    expect(new Date(rows[0].expires_at).toISOString()).toBe(
      new Date(tomadas[0]!.expires_at).toISOString(),
    )

    await seller1.rpc('return_ticket_hold', { p_hold_id: tomadas[0]!.hold_id })
    await seller1.rpc('return_ticket_hold', { p_hold_id: tomadas[1]!.hold_id })
    const nueva = (await apartar(seller1, ids[3]!)).data![0] as HoldRow
    expect((Date.parse(nueva.expires_at) - Date.parse(nueva.started_at)) / 60_000).toBe(45)

    // Con cupo 0 nadie aparta.
    await sinApartados()
    await ajustes(owner, 30, 0)
    expect((await apartar(seller1, ids[4]!)).error?.message).toBe(
      'En esta rifa no se pueden apartar boletas por ahora.',
    )
    await ajustes(owner, HOLD_DEFAULT_MINUTES, HOLD_DEFAULT_MAX_ACTIVE)
  })

  it('solo el dueño configura los apartados', async () => {
    const adminSet = await ajustes(admin, 20, 5)
    expect(adminSet.error?.message).toBe(
      'No tienes permiso para cambiar los apartados de esta rifa.',
    )
    const sellerSet = await ajustes(seller1, 20, 5)
    expect(sellerSet.error?.message).toBe(
      'No tienes permiso para cambiar los apartados de esta rifa.',
    )
    const ajeno = await ajustes(otherOrgOwner, 20, 5)
    expect(ajeno.error?.message).toBe('La rifa no existe o no tienes acceso a ella.')
    const fuera = await ajustes(owner, 4, 5)
    expect(fuera.error?.message).toBe('La duración del apartado debe estar entre 5 y 180 minutos.')

    const comoAdmin = await admin.rpc('raffle_hold_settings_for', { p_raffle_id: raffleId })
    expect(comoAdmin.data![0]).toMatchObject({
      can_manage: false,
      duration_minutes: HOLD_DEFAULT_MINUTES,
    })
    const comoDueno = await owner.rpc('raffle_hold_settings_for', { p_raffle_id: raffleId })
    expect(comoDueno.data![0]!.can_manage).toBe(true)
  })

  it('desactivar a un vendedor cierra en el acto sus apartados', async () => {
    await generar(owner, raffleId, ['99', '99'], ['00', '00'])
    const t = await boleta(raffleId, '99', '00')
    const h = (await apartar(seller2, t.id)).data![0] as HoldRow
    try {
      await db.query(
        'update memberships set is_active = false where profile_id = $1 and organization_id = $2',
        [ctx.ids.seller2, ctx.demoOrg.id],
      )
      const { rows } = await db.query('select end_reason from ticket_holds where id = $1', [
        h.hold_id,
      ])
      expect(rows[0].end_reason).toBe('seller_inactive')
      expect(await apartadoVigente(t.id)).toBeUndefined()
    } finally {
      await db.query(
        'update memberships set is_active = true where profile_id = $1 and organization_id = $2',
        [ctx.ids.seller2, ctx.demoOrg.id],
      )
    }
  })

  it('en una rifa que no esta activa no se aparta', async () => {
    await generar(owner, draftRaffleId, ['00', '00'], ['00', '00'])
    const t = await boleta(draftRaffleId, '00', '00')
    const { error } = await apartar(seller1, t.id)
    expect(error?.message).toBe('La rifa no está activa: no se pueden apartar boletas.')
  })
})

// ===========================================================================
// Liberar una vendida desde un apartado (D-258, I-209: decision del dueño)
// ===========================================================================

function liberar(client: Client, ticketId: string, expectedClientId: string) {
  return client.rpc('release_ticket_client', {
    p_ticket_id: ticketId,
    p_expected_client_id: expectedClientId,
    p_reason: 'El cliente ya no la quiere',
  })
}

/** Una boleta nueva del inventario comun, vendida por vendedor1 desde un apartado. */
async function venderDesdeApartado(daily: string): Promise<string> {
  await generar(owner, raffleId, [daily, daily], ['00', '00'])
  const t = await boleta(raffleId, daily, '00')
  const h = (await apartar(seller1, t.id)).data![0] as HoldRow
  const venta = await seller1.rpc('sell_ticket_hold', {
    p_hold_id: h.hold_id,
    p_client_id: clienteVendedor1,
  })
  if (venta.error) throw new Error(`No se pudo vender: ${venta.error.message}`)
  return t.id
}

async function custodia(ticketId: string) {
  const { rows } = await db.query(
    `select seller_id, client_id, inventory_status, sold_from_hold
       from tickets where id = $1`,
    [ticketId],
  )
  return rows[0] as {
    seller_id: string | null
    client_id: string | null
    inventory_status: string
    sold_from_hold: boolean
  }
}

describe('liberar una boleta vendida desde un apartado (D-258, I-209)', () => {
  it('vuelve al inventario comun, libre para cualquiera, y la bitacora lo dice', async () => {
    const id = await venderDesdeApartado('60')
    expect(await custodia(id)).toMatchObject({
      seller_id: ctx.ids.seller1,
      inventory_status: 'assigned',
      sold_from_hold: true,
    })

    expect((await liberar(seller1, id, clienteVendedor1)).error).toBeNull()
    expect(await custodia(id)).toMatchObject({
      seller_id: null,
      client_id: null,
      inventory_status: 'available',
      sold_from_hold: false,
    })

    // Ya no es suya: el vendedor no la ve entre sus boletas…
    const propia = await seller1.from('tickets').select('id').eq('id', id)
    expect(propia.data).toEqual([])
    // …y cualquier vendedor la puede apartar en el acto.
    const otro = (await apartar(seller2, id)).data![0] as HoldRow
    expect(otro.outcome).toBe('taken')
    await sinApartados()

    const { rows } = await db.query(
      `select new_values ->> 'to_common_inventory' as a_comun, new_values ->> 'seller_id' as vendedor,
              old_values ->> 'sold_from_hold' as de_apartado
         from audit_logs where action = 'ticket.release_client' and entity_id = $1`,
      [id],
    )
    expect(rows).toEqual([{ a_comun: 'true', vendedor: null, de_apartado: 'true' }])
  })

  it('una entregada por el personal y vendida se queda con su vendedor al liberarla', async () => {
    await generar(owner, raffleId, ['61', '61'], ['00', '00'])
    const t = await boleta(raffleId, '61', '00')
    await owner.rpc('admin_assign_inventory_tickets', {
      p_ticket_ids: [t.id],
      p_seller_id: ctx.ids.seller1,
    })
    const venta = await seller1.rpc('bulk_assign_tickets', {
      p_ticket_ids: [t.id],
      p_client_id: clienteVendedor1,
    })
    expect(venta.error).toBeNull()
    expect((await custodia(t.id)).sold_from_hold).toBe(false)

    expect((await liberar(seller1, t.id, clienteVendedor1)).error).toBeNull()
    expect(await custodia(t.id)).toMatchObject({
      seller_id: ctx.ids.seller1,
      inventory_status: 'available',
      sold_from_hold: false,
    })
  })

  it('corregir el cliente no cambia de donde salio la venta', async () => {
    const id = await venderDesdeApartado('62')
    const otroCliente = await nuevoCliente(ctx.ids.seller1, 'Inventario prueba Tres')
    const cambio = await seller1.rpc('reassign_ticket_client', {
      p_ticket_id: id,
      p_expected_client_id: clienteVendedor1,
      p_new_client_id: otroCliente,
      p_reason: 'Se equivocó de cliente',
    })
    expect(cambio.error).toBeNull()
    expect((await custodia(id)).sold_from_hold).toBe(true)

    expect((await liberar(seller1, id, otroCliente)).error).toBeNull()
    expect(await custodia(id)).toMatchObject({ seller_id: null, sold_from_hold: false })
  })

  it('otra venta desde un apartado la marca otra vez; entregada despues por el personal, no', async () => {
    const id = await venderDesdeApartado('63')
    expect((await liberar(seller1, id, clienteVendedor1)).error).toBeNull()

    const h = (await apartar(seller1, id)).data![0] as HoldRow
    const otraVenta = await seller1.rpc('sell_ticket_hold', {
      p_hold_id: h.hold_id,
      p_client_id: clienteVendedor1,
    })
    expect(otraVenta.error).toBeNull()
    expect((await custodia(id)).sold_from_hold).toBe(true)
    expect((await liberar(seller1, id, clienteVendedor1)).error).toBeNull()
    expect((await custodia(id)).seller_id).toBeNull()

    // La historia de apartados no cuenta: lo que decide es la venta VIGENTE.
    await owner.rpc('admin_assign_inventory_tickets', {
      p_ticket_ids: [id],
      p_seller_id: ctx.ids.seller1,
    })
    const vendida = await seller1.rpc('bulk_assign_tickets', {
      p_ticket_ids: [id],
      p_client_id: clienteVendedor1,
    })
    expect(vendida.error).toBeNull()
    expect((await liberar(seller1, id, clienteVendedor1)).error).toBeNull()
    expect((await custodia(id)).seller_id).toBe(ctx.ids.seller1)
  })

  it('ninguna sesion escribe la marca, y la base no la admite fuera de una venta', async () => {
    // Un borrador del vendedor: su politica de UPDATE si le deja tocarlo.
    const { rows } = await db.query(
      `insert into tickets (organization_id, raffle_id, seller_id, inventory_status, created_by)
       values ($1, $2, $3, 'draft', $3) returning id`,
      [ctx.demoOrg.id, raffleId, ctx.ids.seller1],
    )
    const borrador = rows[0].id as string
    try {
      const sesion = await seller1
        .from('tickets')
        .update({ sold_from_hold: true })
        .eq('id', borrador)
        .select('id')
      expect(sesion.error?.code).toBe('42501')

      // Ni la conexion de administracion la pone en una boleta sin vender.
      await expect(
        db.query('update tickets set sold_from_hold = true where id = $1', [borrador]),
      ).rejects.toThrow(/tickets_sold_from_hold_is_a_sale/)
    } finally {
      await db.query('delete from tickets where id = $1', [borrador])
      await db.query('delete from audit_logs where entity_id = $1', [borrador])
    }
  })
})

// ===========================================================================
// Lo ajeno no se revela (BR-I21) y cada organizacion ve lo suyo
// ===========================================================================

describe('el catalogo interno solo dice libre o no disponible', () => {
  it('lo apartado y lo vendido de otro vendedor es «no disponible», sin identificadores', async () => {
    await generar(owner, wideRaffleId, ['5500', '5501'], ['05', '05'])
    const apartada = await boleta(wideRaffleId, '5500', '05')
    const libre = await boleta(wideRaffleId, '5501', '05')
    const h = (await apartar(seller1, apartada.id)).data![0] as HoldRow

    const delOtro = await seller2.rpc('seller_inventory_tickets', {
      p_raffle_id: wideRaffleId,
      p_daily: '550',
      p_only_free: false,
    })
    const fila = (d: string) => delOtro.data!.find((r) => r.daily_number === d)
    expect(fila('5500')).toMatchObject({
      availability: 'unavailable',
      ticket_id: null,
      hold_id: null,
      hold_expires_at: null,
    })
    expect(fila('5501')).toMatchObject({ availability: 'free', ticket_id: libre.id })
    // Una boleta vendida del vendedor1 de la prueba anterior.
    const vendida = await seller2.rpc('seller_inventory_tickets', {
      p_raffle_id: raffleId,
      p_daily: '95',
      p_weekly: '00',
      p_only_free: false,
    })
    // Se mira la exacta.
    expect(
      vendida.data!.find((r) => r.daily_number === '95' && r.weekly_number === '00'),
    ).toMatchObject({ availability: 'unavailable', ticket_id: null })

    const delMismo = await seller1.rpc('seller_inventory_tickets', {
      p_raffle_id: wideRaffleId,
      p_daily: '550',
      p_only_free: false,
    })
    expect(delMismo.data!.find((r) => r.daily_number === '5500')).toMatchObject({
      availability: 'held_by_me',
      ticket_id: apartada.id,
      hold_id: h.hold_id,
    })
    const suya = await seller1.rpc('seller_inventory_tickets', {
      p_raffle_id: raffleId,
      p_daily: '95',
      p_weekly: '00',
      p_only_free: false,
    })
    expect(
      suya.data!.find((r) => r.daily_number === '95' && r.weekly_number === '00')?.availability,
    ).toBe('mine')

    // Solo las libres por omision.
    const soloLibres = await seller2.rpc('seller_inventory_tickets', {
      p_raffle_id: wideRaffleId,
      p_daily: '550',
    })
    expect(soloLibres.data!.map((r) => r.daily_number)).toEqual(['5501'])
    await sinApartados()
  })

  it('el personal si ve quien la tiene apartada, sin nada de la cartera', async () => {
    const t = await boleta(wideRaffleId, '5501', '05')
    const h = (await apartar(seller2, t.id)).data![0] as HoldRow
    const lista = await owner.rpc('admin_list_tickets', {
      p_raffle_id: wideRaffleId,
      p_custody: 'held',
    })
    const fila = lista.data!.find((r) => r.id === t.id)
    expect(fila).toMatchObject({ seller_id: null, held_by: ctx.ids.seller2 })
    expect(Date.parse(fila!.hold_expires_at!)).toBe(Date.parse(h.expires_at))
    const comun = await owner.rpc('admin_list_tickets', {
      p_raffle_id: wideRaffleId,
      p_custody: 'common',
    })
    expect(comun.data!.some((r) => r.id === t.id)).toBe(false)
    const detalle = await owner.rpc('admin_ticket_detail', { p_ticket_id: t.id })
    expect(detalle.data![0]).toMatchObject({ seller_id: null, held_by: ctx.ids.seller2 })
    await sinApartados()
  })

  it('ninguna sesion lee las tablas nuevas, ni las boletas sin vendedor', async () => {
    for (const client of [owner, seller1]) {
      for (const tabla of [
        'ticket_holds',
        'ticket_generation_runs',
        'raffle_hold_settings',
      ] as const) {
        const { data, error } = await client.from(tabla).select('*').limit(1)
        expect(data ?? []).toHaveLength(0)
        expect(error?.code).toBe('42501')
      }
    }
    const { count: delVendedor } = await seller1
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('raffle_id', raffleId)
      .is('seller_id', null)
    expect(delVendedor).toBe(0)
    const { count: delPersonal } = await owner
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('raffle_id', raffleId)
    expect(delPersonal).toBe(0)
  })

  it('otra organizacion no ve el inventario ni puede apartar', async () => {
    const t = await boleta(wideRaffleId, '5501', '05')
    const { data: resumen } = await otherOrgSeller.rpc('seller_inventory_summary')
    expect(resumen!.some((r) => r.raffle_id === raffleId || r.raffle_id === wideRaffleId)).toBe(false)
    const { data: filas } = await otherOrgSeller.rpc('seller_inventory_tickets', {
      p_raffle_id: wideRaffleId,
    })
    expect(filas).toEqual([])
    const { error } = await apartar(otherOrgSeller, t.id)
    expect(error?.message).toBe('La boleta no existe o no tienes acceso a ella.')
    const lista = await otherOrgOwner.rpc('admin_list_tickets', { p_ticket_ids: [t.id] })
    expect(lista.data ?? []).toEqual([])
  })
})

// ===========================================================================
// Lo de siempre sigue igual
// ===========================================================================

describe('lo de siempre sigue igual', () => {
  it('el catalogo publico publica lo asignado al vendedor y nunca lo apartado', async () => {
    await generar(owner, wideRaffleId, ['6600', '6601'], ['06', '06'])
    const asignada = await boleta(wideRaffleId, '6600', '06')
    const apartada = await boleta(wideRaffleId, '6601', '06')
    await owner.rpc('admin_assign_inventory_tickets', {
      p_ticket_ids: [asignada.id],
      p_seller_id: ctx.ids.seller1,
    })
    await apartar(seller1, apartada.id)
    await db.query(
      `update memberships set public_slug = $1, public_catalog_enabled = true,
              public_whatsapp_number = '573001112233', public_raffle_id = $2
        where profile_id = $3 and organization_id = $4`,
      [SLUG, wideRaffleId, ctx.ids.seller1, ctx.demoOrg.id],
    )
    const { rows } = await db.query(
      `select daily_number from public_catalog_tickets($1, '660', 60, 0)`,
      [SLUG],
    )
    expect(rows.map((r) => r.daily_number)).toEqual(['6600'])
    await sinApartados()
  })

  it('el motor de loterias no fotografia el inventario comun y no falla', async () => {
    await generar(owner, lotteryRaffleId, ['7731', '7731'], ['0', '2'])
    const entregada = await boleta(lotteryRaffleId, '7731', '0000')
    const apartada = await boleta(lotteryRaffleId, '7731', '0001')
    await owner.rpc('admin_assign_inventory_tickets', {
      p_ticket_ids: [entregada.id],
      p_seller_id: ctx.ids.seller1,
    })
    await apartar(seller2, apartada.id)

    const { rows: programacion } = await db.query(
      `insert into lottery_draw_schedules
         (lottery_code, draw_number, reference_date, original_scheduled_at, official_scheduled_at,
          schedule_status, source_url, source_authority, verified_at)
       values ('bogota', $1, '2091-07-19', '2091-07-19T22:30:00-05:00', '2091-07-19T22:30:00-05:00',
               'scheduled', 'https://cnjsa.coljuegos.gov.co/publicaciones/306418/', 'CNJSA',
               '2098-01-02T12:00:00-05:00')
       returning id`,
      [`INV${Date.now().toString(36)}`],
    )
    programaciones.push(programacion[0].id)
    const { rows: resultado } = await db.query(
      `insert into lottery_results (schedule_id, winning_number, validation_status, source_url,
                                    source_kind, confirmed_at)
       values ($1, '7731', 'confirmed', 'https://www.loteriadebogota.com/', 'official_page',
               '2091-07-19T22:30:00-05:00')
       returning id`,
      [programacion[0].id],
    )

    const motor = await runLotteryEngine(resultado[0].id)
    expect(motor.error).toBeNull()
    const { rows: fotos } = await db.query(
      'select ticket_id, seller_id from lottery_ticket_matches where result_id = $1 and raffle_id = $2',
      [resultado[0].id, lotteryRaffleId],
    )
    expect(fotos).toEqual([{ ticket_id: entregada.id, seller_id: ctx.ids.seller1 }])
    await db.query(
      `update ticket_holds set ended_at = now(), end_reason = 'returned'
        where raffle_id = $1 and ended_at is null`,
      [lotteryRaffleId],
    )
  })
})
