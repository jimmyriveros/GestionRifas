/**
 * El motor de coincidencias de los premios configurables — Entrega 3 (D-203,
 * migración `0061`; BR-J06, BR-J07, BR-J08, BR-J09, BR-L05..BR-L12).
 *
 * LO QUE SE PRUEBA AQUÍ ES LO QUE SOLO LA BASE PUEDE GARANTIZAR: qué premio y
 * qué VERSIÓN se enlazan a cada fotografía, la prioridad de cuatro cifras POR
 * CLIENTE, que nada se escriba a medias, que un reintento no duplique, que las
 * rifas heredadas sigan igual y que nadie lea o escriba lo que no debe.
 *
 * DATOS AISLADOS. Cada escenario juega en SUS fechas: diciembre de 2082 para el
 * caso del 21 y semanas propias de 2083 para los demás. El motor mira TODAS las
 * rifas que participan en una fecha, así que dos escenarios con fechas cruzadas
 * se contaminarían. Ninguna otra suite usa esos años.
 *
 * LAS BOLETAS se crean con fechas de 2026 —antes de cualquier corte— para que el
 * instante oficial decida la venta como en el motor (BR-L09). Las versiones se
 * publican de verdad por las RPC, con la sesión del Dueño; los sorteos y las
 * boletas, con PostgreSQL directo. La limpieza borra todo al final con
 * `session_replication_role = replica`, porque fotografías y enlaces son
 * inmutables también para la service role.
 */
import { performance } from 'node:perf_hooks'

import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  prizeDrawCutoff,
  prizeNumberMatches,
  resolvePrizeLinks,
  type PrizeCandidate,
  type PrizeDigits,
} from '@/features/raffle-prizes/matching'

import { anonClient, DB_URL, loadSeedContext, signInAs, USERS, type Client } from './helpers'

type Campo = 'daily_number' | 'weekly_number'
type Loteria = 'cundinamarca' | 'cruz_roja' | 'meta' | 'bogota' | 'medellin' | 'boyaca'

type Regla = {
  start_date: string
  end_date: string
  weekdays: number[]
  lottery_mode: 'corresponding' | 'fixed'
  lottery_code: Loteria | null
}

type Opcion = { description: string | null; amount: number | null }

type PremioInput = {
  titulo: string
  campo: Campo
  cifras: PrizeDigits
  reglas: Regla[]
  categoria?: 'main' | 'daily' | 'weekly' | 'special'
  modo?: 'fixed' | 'winner_choice'
  opciones?: Opcion[]
}

type Enlace = {
  ticket_id: string
  match_id: string
  match_field: Campo
  matched_number: string
  assignment_status: 'sold' | 'available' | 'late_assignment'
  client_id: string | null
  seller_id: string
  raffle_id: string
  organization_id: string
  prize_id: string | null
  prize_version_id: string | null
  digits: PrizeDigits | null
}

const PREFIJO = 'E3 motor'
const PRECIO = 120_000
/** Antes de cualquier corte de esta suite: la boleta ya existía en el sorteo. */
const CREADA = '2026-01-01T08:00:00-05:00'
/** Vendida antes de cualquier corte de esta suite. */
const VENDIDA = '2026-01-02T08:00:00-05:00'
const NOMINAL: Record<Loteria, number> = {
  cundinamarca: 1,
  cruz_roja: 2,
  meta: 3,
  bogota: 4,
  medellin: 5,
  boyaca: 6,
}

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let db: PgClient
let owner: Client
let admin: Client
let seller1: Client
let seller2: Client
let otherOrgOwner: Client
let otherOrgSeller: Client
let controlOwnerId: string

const stamp = Date.now().toString(36)
let secuencia = 0
let proximoLunes = ''

// -----------------------------------------------------------------------------
// Fechas
// -----------------------------------------------------------------------------

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + days, 12)).toISOString().slice(0, 10)
}

function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y!, m! - 1, d!, 12)).getUTCDay()
  return day === 0 ? 7 : day
}

/** El día de la semana de `lunes` en que juega una lotería. */
function diaDe(lunes: string, loteria: Loteria): string {
  return addDays(lunes, NOMINAL[loteria] - 1)
}

function horaDe(fecha: string): string {
  return `${fecha}T22:30:00-05:00`
}

/** Un bloque de semanas que ningún otro escenario usa. */
function semanas(n = 1): { lunes: string; desde: string; hasta: string } {
  const lunes = proximoLunes
  proximoLunes = addDays(proximoLunes, 7 * n)
  return { lunes, desde: lunes, hasta: addDays(lunes, 7 * n - 1) }
}

// -----------------------------------------------------------------------------
// Escenario: rifas, premios, boletas y sorteos
// -----------------------------------------------------------------------------

function unDia(fecha: string, loteria: Loteria | null = null): Regla {
  return {
    start_date: fecha,
    end_date: fecha,
    weekdays: [isoWeekday(fecha)],
    lottery_mode: loteria ? 'fixed' : 'corresponding',
    lottery_code: loteria,
  }
}

function tramo(desde: string, hasta: string, dias: number[]): Regla {
  return {
    start_date: desde,
    end_date: hasta,
    weekdays: dias,
    lottery_mode: 'corresponding',
    lottery_code: null,
  }
}

async function nuevaRifa(
  nombre: string,
  desde: string,
  hasta: string,
  opciones: { modo?: 'legacy' | 'configurable'; org?: 'demo' | 'control' } = {},
): Promise<string> {
  const control = opciones.org === 'control'
  const { rows } = await db.query<{ id: string }>(
    `insert into raffles (organization_id, name, ticket_price, start_date, end_date, created_by, prize_mode)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [
      control ? ctx.controlOrg.id : ctx.demoOrg.id,
      `${PREFIJO} ${nombre} ${stamp}`,
      PRECIO,
      desde,
      hasta,
      control ? controlOwnerId : ctx.ids.owner,
      opciones.modo ?? 'configurable',
    ],
  )
  return rows[0]!.id
}

async function activar(raffleId: string): Promise<void> {
  await db.query(`update raffles set status = 'active' where id = $1`, [raffleId])
}

function argumentosDe(p: PremioInput) {
  return {
    p_title: p.titulo,
    p_category: p.categoria ?? 'daily',
    p_reward_mode: p.modo ?? 'fixed',
    p_reward_options: p.opciones ?? [{ description: null, amount: 500_000 }],
    p_number_field: p.campo,
    p_digits: p.cifras,
    p_rules: p.reglas,
  }
}

async function premio(
  client: Client,
  raffleId: string,
  p: PremioInput,
): Promise<{ prizeId: string; versionId: string }> {
  const { data, error } = await client.rpc('create_raffle_prize', {
    p_raffle_id: raffleId,
    ...argumentosDe(p),
  })
  if (error) throw new Error(`No se pudo crear el premio «${p.titulo}»: ${error.message}`)
  const fila = (data as unknown as Array<{ prize_id: string; version_id: string }>)[0]!
  return { prizeId: fila.prize_id, versionId: fila.version_id }
}

async function publicar(
  prizeId: string,
  expectedVersionId: string,
  p: PremioInput,
): Promise<string> {
  const { data, error } = await owner.rpc('publish_raffle_prize_version', {
    p_prize_id: prizeId,
    p_expected_version_id: expectedVersionId,
    ...argumentosDe(p),
  })
  if (error) throw new Error(`No se pudo publicar «${p.titulo}»: ${error.message}`)
  return (data as unknown as Array<{ version_id: string }>)[0]!.version_id
}

async function archivar(prizeId: string, expectedVersionId: string): Promise<string> {
  const { data, error } = await owner.rpc('archive_raffle_prize', {
    p_prize_id: prizeId,
    p_expected_version_id: expectedVersionId,
  })
  if (error) throw new Error(`No se pudo archivar: ${error.message}`)
  return (data as unknown as Array<{ version_id: string }>)[0]!.version_id
}

type BoletaInput = {
  diario: string
  semanal: string
  vendedor?: 'seller1' | 'seller2' | 'control'
  /** Cliente de la venta. Sin cliente, la boleta queda disponible. */
  cliente?: string
  vendidaEn?: string
  creadaEn?: string
  estado?: 'pending_approval' | 'cancelled'
  anuladaEn?: string
  aprobadaEn?: string
}

/** Crea las boletas y devuelve sus ids en el mismo orden. */
async function boletas(raffleId: string, filas: BoletaInput[]): Promise<string[]> {
  const ids: string[] = []
  for (const fila of filas) {
    const control = fila.vendedor === 'control'
    const vendedor = control
      ? ctx.ids.otherOrgSeller
      : fila.vendedor === 'seller2'
        ? ctx.ids.seller2
        : ctx.ids.seller1
    const { rows } = await db.query<{ id: string }>(
      `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number,
                            weekly_number, inventory_status, created_at, approved_at, approved_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, case when $9::timestamptz is null then null else $4::uuid end)
       returning id`,
      [
        control ? ctx.controlOrg.id : ctx.demoOrg.id,
        raffleId,
        vendedor,
        control ? controlOwnerId : ctx.ids.owner,
        fila.diario,
        fila.semanal,
        fila.estado === 'pending_approval' ? 'pending_approval' : 'available',
        fila.creadaEn ?? CREADA,
        fila.aprobadaEn ?? null,
      ],
    )
    const id = rows[0]!.id
    if (fila.cliente) {
      await db.query(
        `update tickets
            set client_id = $2, inventory_status = 'assigned', sale_price = $3,
                sale_date = '2026-01-02', assigned_at = $4
          where id = $1`,
        [id, fila.cliente, PRECIO, fila.vendidaEn ?? VENDIDA],
      )
    }
    if (fila.estado === 'cancelled') {
      await db.query(
        `update tickets set inventory_status = 'cancelled', cancelled_at = $2,
                cancel_reason = 'Prueba del motor de premios'
          where id = $1`,
        [id, fila.anuladaEn ?? VENDIDA],
      )
    }
    ids.push(id)
  }
  return ids
}

type SorteoOpciones = {
  /** `null` = sin hora original. Por omisión, la hora oficial. */
  original?: string | null
  /** `null` = sin hora oficial, solo con `schedule_unverified`. Por omisión, las 22:30 del día. */
  oficial?: string | null
  estado?:
    'scheduled' | 'rescheduled_later' | 'rescheduled_earlier' | 'completed' | 'schedule_unverified'
}

async function programacion(
  loteria: Loteria,
  fecha: string,
  opciones: SorteoOpciones = {},
): Promise<{ scheduleId: string; drawNumber: string }> {
  secuencia += 1
  const drawNumber = `E3-${stamp}-${secuencia}`
  const oficial = opciones.oficial === undefined ? horaDe(fecha) : opciones.oficial
  const { rows } = await db.query<{ id: string }>(
    `insert into lottery_draw_schedules (lottery_code, draw_number, reference_date,
                                         original_scheduled_at, official_scheduled_at, schedule_status)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      loteria,
      drawNumber,
      fecha,
      opciones.original === undefined ? oficial : opciones.original,
      oficial,
      opciones.estado ?? 'scheduled',
    ],
  )
  return { scheduleId: rows[0]!.id, drawNumber }
}

/** Programación y resultado confirmado, sin buscar coincidencias todavía. */
async function sorteo(
  loteria: Loteria,
  fecha: string,
  ganador: string,
  opciones: SorteoOpciones = {},
): Promise<{ scheduleId: string; resultId: string; drawNumber: string }> {
  const { scheduleId, drawNumber } = await programacion(loteria, fecha, opciones)
  const { rows } = await db.query<{ id: string }>(
    `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
     values ($1, $2, 'confirmed', 'official_page', now())
     returning id`,
    [scheduleId, ganador],
  )
  return { scheduleId, resultId: rows[0]!.id, drawNumber }
}

async function buscar(resultId: string) {
  return ctx.svc.rpc('match_lottery_result', { p_result_id: resultId })
}

async function buscarBien(resultId: string): Promise<{ inserted: number; prize_links: number }> {
  const { data, error } = await buscar(resultId)
  if (error) throw new Error(`El motor falló: ${error.message}`)
  return data as unknown as { inserted: number; prize_links: number }
}

/** Fotografías de un resultado con sus enlaces (una fila por enlace o por fotografía sin enlace). */
async function enlacesDe(resultId: string): Promise<Enlace[]> {
  const { rows } = await db.query<Enlace>(
    `select m.ticket_id, m.id as match_id, m.match_field::text as match_field, m.matched_number,
            m.assignment_status::text as assignment_status, m.client_id, m.seller_id, m.raffle_id,
            m.organization_id, l.prize_id, l.prize_version_id, v.digits::text as digits
       from lottery_ticket_matches m
       left join lottery_ticket_match_prizes l on l.match_id = m.id
       left join raffle_prize_versions v on v.id = l.prize_version_id
      where m.result_id = $1
      order by m.ticket_id, m.match_field, l.prize_id`,
    [resultId],
  )
  return rows
}

/** `boleta:premio` de cada enlace, ordenado. */
function pares(enlaces: Enlace[]): string[] {
  return enlaces.map((e) => `${e.ticket_id}:${e.prize_id}`).sort()
}

function par(ticketId: string, prizeId: string): string {
  return `${ticketId}:${prizeId}`
}

async function contar(sql: string, params: unknown[]): Promise<number> {
  const { rows } = await db.query<{ n: number }>(sql, params)
  return rows[0]!.n
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** El instante exacto en que se publicó una versión, como lo guarda la base. */
async function publicadaEn(versionId: string): Promise<string> {
  const { rows } = await db.query<{ t: string }>(
    `select published_at::text as t from raffle_prize_versions where id = $1`,
    [versionId],
  )
  return rows[0]!.t
}

/** El instante que queda a mitad de camino entre dos. */
async function entre(a: string, b: string): Promise<string> {
  const { rows } = await db.query<{ t: string }>(
    `select ($1::timestamptz + ($2::timestamptz - $1::timestamptz) / 2)::text as t`,
    [a, b],
  )
  return rows[0]!.t
}

/** Un instante desplazado por un intervalo de PostgreSQL, p. ej. `'1 day'`. */
async function desplazado(instante: string, intervalo: string): Promise<string> {
  const { rows } = await db.query<{ t: string }>(
    `select ($1::timestamptz + $2::interval)::text as t`,
    [instante, intervalo],
  )
  return rows[0]!.t
}

/** El corte efectivo de una programación, calculado por la definición canónica. */
async function corteDe(scheduleId: string): Promise<string | null> {
  const { rows } = await db.query<{ t: string | null }>(
    `select raffle_prize_draw_cutoff(s)::text as t from lottery_draw_schedules s where s.id = $1`,
    [scheduleId],
  )
  return rows[0]!.t
}

/** Si dos instantes escritos de forma distinta son el mismo. */
async function mismoInstante(a: string | null, b: string | null): Promise<boolean> {
  const { rows } = await db.query<{ igual: boolean }>(
    `select $1::timestamptz is not distinct from $2::timestamptz as igual`,
    [a, b],
  )
  return rows[0]!.igual
}

// -----------------------------------------------------------------------------
// Limpieza
// -----------------------------------------------------------------------------

async function limpiar(): Promise<void> {
  await db.query('begin')
  try {
    await db.query(`set local session_replication_role = replica`)
    const { rows: rifas } = await db.query<{ id: string }>(
      `select id from raffles where name like $1`,
      [`${PREFIJO} %`],
    )
    const { rows: sorteos } = await db.query<{ id: string }>(
      `select id from lottery_draw_schedules where draw_number like 'E3-%'`,
    )
    const rifaIds = rifas.map((r) => r.id)
    const sorteoIds = sorteos.map((s) => s.id)

    await db.query(
      `delete from lottery_ticket_match_prizes
        where raffle_id = any ($1::uuid[])
           or result_id in (select id from lottery_results where schedule_id = any ($2::uuid[]))`,
      [rifaIds, sorteoIds],
    )
    await db.query(
      `delete from lottery_ticket_matches
        where raffle_id = any ($1::uuid[])
           or result_id in (select id from lottery_results where schedule_id = any ($2::uuid[]))`,
      [rifaIds, sorteoIds],
    )
    await db.query(
      `delete from notifications
        where entity_id in (select id from lottery_results where schedule_id = any ($2::uuid[]))
           or entity_id in (select id from tickets where raffle_id = any ($1::uuid[]))
           or (kind = 'raffle_prize.changed' and (data ->> 'raffle_id')::uuid = any ($1::uuid[]))`,
      [rifaIds, sorteoIds],
    )
    await db.query(`delete from lottery_results where schedule_id = any ($1::uuid[])`, [sorteoIds])
    await db.query(`delete from lottery_draw_schedules where id = any ($1::uuid[])`, [sorteoIds])
    await db.query(
      `delete from audit_logs
        where entity_id in (select id from tickets where raffle_id = any ($1::uuid[]))
           or entity_id = any ($1::uuid[])
           or (entity_type = 'raffle_prize'
               and (coalesce(new_values, old_values) ->> 'raffle_id')::uuid = any ($1::uuid[]))`,
      [rifaIds],
    )
    await db.query(`delete from commission_ledger where raffle_id = any ($1::uuid[])`, [rifaIds])
    await db.query(`delete from seller_commissions where raffle_id = any ($1::uuid[])`, [rifaIds])
    await db.query(`delete from tickets where raffle_id = any ($1::uuid[])`, [rifaIds])
    await db.query(
      `delete from raffle_prize_reward_options where version_id in (
         select id from raffle_prize_versions where raffle_id = any ($1::uuid[]))`,
      [rifaIds],
    )
    await db.query(
      `delete from raffle_prize_schedule_rules where version_id in (
         select id from raffle_prize_versions where raffle_id = any ($1::uuid[]))`,
      [rifaIds],
    )
    await db.query(`delete from raffle_prizes where raffle_id = any ($1::uuid[])`, [rifaIds])
    await db.query(`delete from raffle_prize_versions where raffle_id = any ($1::uuid[])`, [
      rifaIds,
    ])
    await db.query(`delete from raffles where id = any ($1::uuid[])`, [rifaIds])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  }
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  await limpiar()

  const { rows } = await db.query<{ id: string }>(`select id from profiles where email = $1`, [
    USERS.otherOrgOwner,
  ])
  controlOwnerId = rows[0]!.id
  ;[owner, admin, seller1, seller2, otherOrgOwner, otherOrgSeller] = await Promise.all([
    signInAs(USERS.owner),
    signInAs(USERS.admin),
    signInAs(USERS.seller1),
    signInAs(USERS.seller2),
    signInAs(USERS.otherOrgOwner),
    signInAs(USERS.otherOrgSeller),
  ])

  // El primer lunes de 2083: desde ahí se reparten semanas. Diciembre de 2082 es
  // del caso del 21.
  let lunes = '2083-01-01'
  while (isoWeekday(lunes) !== 1) lunes = addDays(lunes, 1)
  proximoLunes = lunes
}, 60_000)

afterAll(async () => {
  await limpiar()
  await Promise.all(
    [owner, admin, seller1, seller2, otherOrgOwner, otherOrgSeller].map((c) => c?.auth.signOut()),
  )
  await db.end()
}, 60_000)

// =============================================================================
describe('M1 — rifas heredadas: el comportamiento de siempre (1)', () => {
  it('M1-01: lunes compara el diario con cuatro cifras exactas y no crea enlaces', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('heredada lunes', desde, hasta, { modo: 'legacy' })
    await activar(rifa)
    const [exacta, soloTres, semanalIgual, corta] = await boletas(rifa, [
      { diario: '3141', semanal: '0001', cliente: ctx.clients.ana.id },
      { diario: '9141', semanal: '0002' },
      { diario: '0003', semanal: '3141' },
      { diario: '141', semanal: '0004' },
    ])
    const { resultId } = await sorteo('cundinamarca', diaDe(lunes, 'cundinamarca'), '3141')

    const salida = await buscarBien(resultId)
    const filas = await enlacesDe(resultId)

    expect(filas.map((f) => f.ticket_id)).toEqual([exacta])
    expect(filas[0]).toMatchObject({
      match_field: 'daily_number',
      matched_number: '3141',
      assignment_status: 'sold',
      client_id: ctx.clients.ana.id,
      prize_id: null,
    })
    expect(filas.map((f) => f.ticket_id)).not.toContain(soloTres)
    expect(filas.map((f) => f.ticket_id)).not.toContain(semanalIgual)
    expect(filas.map((f) => f.ticket_id)).not.toContain(corta)
    expect(salida).toMatchObject({ inserted: 1, prize_links: 0 })
  })

  it('M1-02: Boyacá compara el semanal, y el diario igual no coincide', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('heredada sabado', desde, hasta, { modo: 'legacy' })
    await activar(rifa)
    const [semanal, diario] = await boletas(rifa, [
      { diario: '0011', semanal: '2718' },
      { diario: '2718', semanal: '0012' },
    ])
    const { resultId } = await sorteo('boyaca', diaDe(lunes, 'boyaca'), '2718')
    await buscarBien(resultId)

    const filas = await enlacesDe(resultId)
    expect(filas.map((f) => f.ticket_id)).toEqual([semanal])
    expect(filas[0]!.match_field).toBe('weekly_number')
    expect(filas.map((f) => f.ticket_id)).not.toContain(diario)
    expect(
      await contar(
        `select count(*)::int as n from lottery_ticket_match_prizes where result_id = $1`,
        [resultId],
      ),
    ).toBe(0)
  })

  it('M1-03: los avisos de una rifa heredada cuentan lo mismo que antes', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('heredada avisos', desde, hasta, { modo: 'legacy' })
    await activar(rifa)
    await boletas(rifa, [
      { diario: '5050', semanal: '0001', cliente: ctx.clients.ana.id },
      { diario: '5050', semanal: '0002' },
      { diario: '5050', semanal: '0003', vendedor: 'seller2', cliente: ctx.clients.diego.id },
    ])
    const fecha = diaDe(lunes, 'meta')
    const { drawNumber } = await programacion('meta', fecha)

    const { data, error } = await ctx.svc.rpc('confirm_lottery_result', {
      p_lottery_code: 'meta',
      p_draw_number: drawNumber,
      p_winning_number: '5050',
    })
    expect(error).toBeNull()
    const resultId = (data as unknown as { result_id: string }).result_id

    const { rows } = await db.query<{
      recipient_profile_id: string
      data: Record<string, unknown>
    }>(
      `select recipient_profile_id, data from notifications
        where kind = 'lottery.result' and entity_id = $1`,
      [resultId],
    )
    const delVendedor1 = rows.find((r) => r.recipient_profile_id === ctx.ids.seller1)!
    const delVendedor2 = rows.find((r) => r.recipient_profile_id === ctx.ids.seller2)!
    const delDueno = rows.find((r) => r.recipient_profile_id === ctx.ids.owner)!
    expect(delVendedor1.data).toMatchObject({ sold_count: 1, available_count: 1 })
    expect(delVendedor2.data).toMatchObject({ sold_count: 1, available_count: 0 })
    expect(delDueno.data).toMatchObject({ audience: 'staff', sold_count: 2, available_count: 1 })
  })
})

// =============================================================================
describe('M1b — la elegibilidad es LA MISMA en los dos motores (BR-L05, BR-L09, BR-L10)', () => {
  /** Las mismas boletas en una rifa heredada y en una configurable. */
  function lote(cliente: string, fecha: string): BoletaInput[] {
    return [
      { diario: '2020', semanal: '0001', cliente },
      { diario: '2020', semanal: '0002' },
      { diario: '2020', semanal: '0003', cliente, vendidaEn: horaDe(addDays(fecha, 1)) },
      { diario: '2020', semanal: '0004', estado: 'pending_approval' },
      { diario: '2020', semanal: '0005', estado: 'cancelled', anuladaEn: VENDIDA },
      // Anulada DESPUÉS del sorteo: sin aprobación registrada no hay forma de saber
      // si estaba disponible, y el motor de siempre la deja fuera…
      {
        diario: '2020',
        semanal: '0006',
        estado: 'cancelled',
        anuladaEn: horaDe(addDays(fecha, 1)),
      },
      // …y con la aprobación anterior al sorteo, entra como disponible.
      {
        diario: '2020',
        semanal: '0007',
        estado: 'cancelled',
        anuladaEn: horaDe(addDays(fecha, 1)),
        aprobadaEn: VENDIDA,
      },
      { diario: '2020', semanal: '0008', creadaEn: horaDe(addDays(fecha, 1)) },
      // Aprobada y anulada ANTES del sorteo: la anulación la deja fuera aunque la
      // aprobación la haría elegible.
      {
        diario: '2020',
        semanal: '0009',
        estado: 'cancelled',
        anuladaEn: VENDIDA,
        aprobadaEn: CREADA,
      },
    ]
  }

  it('M1b-01: vendida, libre, tardía, pendiente, anulada antes, anulada después y creada después se tratan igual', async () => {
    const { lunes, desde, hasta } = semanas()
    const fecha = diaDe(lunes, 'cundinamarca')
    const heredada = await nuevaRifa('elegibilidad heredada', desde, hasta, { modo: 'legacy' })
    await activar(heredada)
    const configurable = await nuevaRifa('elegibilidad configurable', desde, hasta)
    await premio(owner, configurable, {
      titulo: 'Cuatro diario',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(fecha)],
    })
    await activar(configurable)
    const idsH = await boletas(heredada, lote(ctx.clients.ana.id, fecha))
    const idsC = await boletas(configurable, lote(ctx.clients.ana.id, fecha))

    const { resultId } = await sorteo('cundinamarca', fecha, '2020')
    await buscarBien(resultId)
    const filas = await enlacesDe(resultId)

    const resumen = (ids: string[]) =>
      ids.map((id) => {
        const f = filas.find((x) => x.ticket_id === id)
        return f ? `${f.assignment_status}:${f.client_id ? 'cliente' : 'sin'}` : 'fuera'
      })
    expect(resumen(idsH)).toEqual([
      'sold:cliente',
      'available:sin',
      'late_assignment:sin',
      'fuera',
      'fuera',
      'fuera',
      'available:sin',
      'fuera',
      'fuera',
    ])
    expect(resumen(idsC)).toEqual(resumen(idsH))
    expect(filas.filter((f) => f.raffle_id === heredada).every((f) => f.prize_id === null)).toBe(
      true,
    )
    expect(
      filas.filter((f) => f.raffle_id === configurable).every((f) => f.prize_id !== null),
    ).toBe(true)
  })

  it('M1b-02: una rifa configurable en borrador o anulada no participa; una cerrada, sí', async () => {
    const { lunes, desde, hasta } = semanas()
    const fecha = diaDe(lunes, 'cruz_roja')
    const crear = async (nombre: string) => {
      const rifa = await nuevaRifa(nombre, desde, hasta)
      const p = await premio(owner, rifa, {
        titulo: 'Cuatro diario',
        campo: 'daily_number',
        cifras: 'four',
        reglas: [unDia(fecha)],
      })
      const [boleta] = await boletas(rifa, [{ diario: '3030', semanal: '0001' }])
      return { rifa, p, boleta: boleta! }
    }
    const borrador = await crear('estado borrador')
    const anulada = await crear('estado anulada')
    await db.query(`update raffles set status = 'cancelled' where id = $1`, [anulada.rifa])
    const cerrada = await crear('estado cerrada')
    await activar(cerrada.rifa)
    await db.query(`update raffles set status = 'closed' where id = $1`, [cerrada.rifa])

    const { resultId } = await sorteo('cruz_roja', fecha, '3030')
    await buscarBien(resultId)

    expect(pares(await enlacesDe(resultId))).toEqual([par(cerrada.boleta, cerrada.p.prizeId)])
    expect((await enlacesDe(resultId)).map((f) => f.ticket_id)).not.toContain(borrador.boleta)
  })
})

// =============================================================================
describe('M2 — cuatro cifras y las tres últimas (BR-J06)', () => {
  it('M2-01: cuatro cifras con el número DIARIO (2)', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('cuatro diario', desde, hasta)
    const p = await premio(owner, rifa, {
      titulo: 'Cuatro diario',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(diaDe(lunes, 'cruz_roja'))],
    })
    await activar(rifa)
    const [si, semanal, tres] = await boletas(rifa, [
      { diario: '6021', semanal: '0001', cliente: ctx.clients.carlos.id },
      { diario: '0002', semanal: '6021' },
      { diario: '9021', semanal: '0003' },
    ])
    const { resultId } = await sorteo('cruz_roja', diaDe(lunes, 'cruz_roja'), '6021')
    await buscarBien(resultId)

    const filas = await enlacesDe(resultId)
    expect(pares(filas)).toEqual([par(si!, p.prizeId)])
    expect(filas[0]).toMatchObject({
      match_field: 'daily_number',
      prize_version_id: p.versionId,
      digits: 'four',
    })
    expect(filas.map((f) => f.ticket_id)).not.toContain(semanal)
    expect(filas.map((f) => f.ticket_id)).not.toContain(tres)
  })

  it('M2-02: cuatro cifras con el número SEMANAL, también un día que no es sábado (3)', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('cuatro semanal', desde, hasta)
    const p = await premio(owner, rifa, {
      titulo: 'Cuatro semanal',
      categoria: 'weekly',
      campo: 'weekly_number',
      cifras: 'four',
      reglas: [unDia(diaDe(lunes, 'cundinamarca'))],
    })
    await activar(rifa)
    const [si, diario] = await boletas(rifa, [
      { diario: '0001', semanal: '7342' },
      { diario: '7342', semanal: '0002' },
    ])
    const { resultId } = await sorteo('cundinamarca', diaDe(lunes, 'cundinamarca'), '7342')
    await buscarBien(resultId)

    const filas = await enlacesDe(resultId)
    expect(pares(filas)).toEqual([par(si!, p.prizeId)])
    expect(filas[0]).toMatchObject({ match_field: 'weekly_number', matched_number: '7342' })
    expect(filas.map((f) => f.ticket_id)).not.toContain(diario)
  })

  it('M2-03: las tres últimas con ceros iniciales, y los números cortos no participan (4, 5)', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('tres ultimas', desde, hasta)
    const p = await premio(owner, rifa, {
      titulo: 'Tres últimas',
      categoria: 'special',
      campo: 'daily_number',
      cifras: 'last_three',
      reglas: [unDia(diaDe(lunes, 'meta'))],
    })
    await activar(rifa)
    const numeros = ['046', '1046', '0046', '9046', '46', '6', '0146', '0460']
    const ids = await boletas(
      rifa,
      numeros.map((diario, i) => ({ diario, semanal: String(i + 1).padStart(4, '0') })),
    )
    const { resultId } = await sorteo('meta', diaDe(lunes, 'meta'), '0046')
    await buscarBien(resultId)

    const conEnlace = new Set((await enlacesDe(resultId)).map((f) => f.ticket_id))
    const coinciden = numeros.filter((_, i) => conEnlace.has(ids[i]!))
    expect(coinciden.sort()).toEqual(['0046', '046', '1046', '9046'])
    for (const e of await enlacesDe(resultId)) expect(e.prize_id).toBe(p.prizeId)
  })

  it('M2-04: el motor responde EXACTAMENTE lo mismo que `prizeNumberMatches` (TypeScript ↔ PostgreSQL)', async () => {
    const numeros = [
      '0046',
      '046',
      '46',
      '6',
      '1046',
      '0146',
      '4600',
      '0460',
      '9999',
      '000',
      '0000',
    ]
    const ganador = '0046'
    for (const cifras of ['four', 'last_three'] as const) {
      const { lunes, desde, hasta } = semanas()
      const rifa = await nuevaRifa(`tabla ${cifras}`, desde, hasta)
      await premio(owner, rifa, {
        titulo: `Tabla ${cifras}`,
        campo: 'daily_number',
        cifras,
        reglas: [unDia(diaDe(lunes, 'bogota'))],
      })
      await activar(rifa)
      const ids = await boletas(
        rifa,
        numeros.map((diario, i) => ({ diario, semanal: String(i + 1).padStart(4, '0') })),
      )
      const { resultId } = await sorteo('bogota', diaDe(lunes, 'bogota'), ganador)
      await buscarBien(resultId)

      const conEnlace = new Set((await enlacesDe(resultId)).map((f) => f.ticket_id))
      numeros.forEach((numero, i) => {
        expect(conEnlace.has(ids[i]!), `${numero} con ${cifras}`).toBe(
          prizeNumberMatches(numero, ganador, cifras),
        )
      })
    }
  })
})

// =============================================================================
describe('M3 — el calendario y la lotería (BR-J04, BR-J05)', () => {
  async function unaBoletaQueCoincide(rifa: string, numero: string): Promise<string> {
    const [id] = await boletas(rifa, [{ diario: numero, semanal: '0001' }])
    return id!
  }

  async function coincide(resultId: string, ticketId: string): Promise<boolean> {
    await buscarBien(resultId)
    return (await enlacesDe(resultId)).some((f) => f.ticket_id === ticketId && f.prize_id !== null)
  }

  it('M3-01: un período de UNA fecha juega ese día y no el lunes siguiente (6, 10)', async () => {
    const { lunes, desde, hasta } = semanas(2)
    const rifa = await nuevaRifa('una fecha', desde, hasta)
    await premio(owner, rifa, {
      titulo: 'Una fecha',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(lunes)],
    })
    await activar(rifa)
    const boleta = await unaBoletaQueCoincide(rifa, '1111')

    expect(await coincide((await sorteo('cundinamarca', lunes, '1111')).resultId, boleta)).toBe(
      true,
    )
    expect(
      await coincide((await sorteo('cundinamarca', addDays(lunes, 7), '1111')).resultId, boleta),
    ).toBe(false)
    // Y un día de la misma semana que no está en su calendario.
    expect(
      await coincide((await sorteo('cruz_roja', addDays(lunes, 1), '1111')).resultId, boleta),
    ).toBe(false)
  })

  it('M3-02: un tramo continuo juega todos sus días, también el sábado con el número diario (7)', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('tramo continuo', desde, hasta)
    await premio(owner, rifa, {
      titulo: 'Tramo',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [tramo(lunes, addDays(lunes, 5), [1, 2, 3, 4, 5, 6])],
    })
    await activar(rifa)
    const boleta = await unaBoletaQueCoincide(rifa, '2222')

    expect(
      await coincide(
        (await sorteo('cruz_roja', diaDe(lunes, 'cruz_roja'), '2222')).resultId,
        boleta,
      ),
    ).toBe(true)
    // La categoría no decide nada (BR-J03): un premio diario también juega con Boyacá.
    expect(
      await coincide((await sorteo('boyaca', diaDe(lunes, 'boyaca'), '2222')).resultId, boleta),
    ).toBe(true)
  })

  it('M3-03: días concretos dentro de un tramo: los miércoles sí, el jueves no (8)', async () => {
    const { lunes, desde, hasta } = semanas(2)
    const rifa = await nuevaRifa('miercoles', desde, hasta)
    await premio(owner, rifa, {
      titulo: 'Miércoles',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [tramo(lunes, addDays(lunes, 13), [3])],
    })
    await activar(rifa)
    const boleta = await unaBoletaQueCoincide(rifa, '3333')

    expect(
      await coincide((await sorteo('meta', diaDe(lunes, 'meta'), '3333')).resultId, boleta),
    ).toBe(true)
    expect(
      await coincide(
        (await sorteo('meta', addDays(diaDe(lunes, 'meta'), 7), '3333')).resultId,
        boleta,
      ),
    ).toBe(true)
    expect(
      await coincide((await sorteo('bogota', diaDe(lunes, 'bogota'), '3333')).resultId, boleta),
    ).toBe(false)
  })

  it('M3-04: varias ventanas separadas juegan las dos y no el hueco del medio (9)', async () => {
    const { lunes, desde, hasta } = semanas(3)
    const rifa = await nuevaRifa('ventanas', desde, hasta)
    await premio(owner, rifa, {
      titulo: 'Dos ventanas',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(lunes), unDia(addDays(lunes, 14))],
    })
    await activar(rifa)
    const boleta = await unaBoletaQueCoincide(rifa, '4444')

    expect(await coincide((await sorteo('cundinamarca', lunes, '4444')).resultId, boleta)).toBe(
      true,
    )
    expect(
      await coincide((await sorteo('cundinamarca', addDays(lunes, 7), '4444')).resultId, boleta),
    ).toBe(false)
    expect(
      await coincide((await sorteo('cundinamarca', addDays(lunes, 14), '4444')).resultId, boleta),
    ).toBe(true)
  })

  it('M3-05: la lotería correspondiente es la del día, y otra lotería ese día no juega (11, 13)', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('correspondiente', desde, hasta)
    await premio(owner, rifa, {
      titulo: 'Correspondiente',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(diaDe(lunes, 'meta'))],
    })
    await activar(rifa)
    const boleta = await unaBoletaQueCoincide(rifa, '5555')
    const miercoles = diaDe(lunes, 'meta')

    // Una programación de otra lotería con la misma fecha de referencia —un dato
    // que no debería existir (D-143)— no juega.
    expect(await coincide((await sorteo('bogota', miercoles, '5555')).resultId, boleta)).toBe(false)
    expect(await coincide((await sorteo('meta', miercoles, '5555')).resultId, boleta)).toBe(true)
  })

  it('M3-06: una lotería fija juega con ESA lotería y con ninguna otra (12, 13)', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('fija', desde, hasta)
    const viernes = diaDe(lunes, 'medellin')
    await premio(owner, rifa, {
      titulo: 'Fija Medellín',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(viernes, 'medellin')],
    })
    await activar(rifa)
    const boleta = await unaBoletaQueCoincide(rifa, '6666')

    expect(await coincide((await sorteo('boyaca', viernes, '6666')).resultId, boleta)).toBe(false)
    expect(await coincide((await sorteo('medellin', viernes, '6666')).resultId, boleta)).toBe(true)
  })

  it('M3-07: el predicado del motor dice lo mismo que la expansión canónica `raffle_prize_rule_dates`', async () => {
    const { lunes, desde, hasta } = semanas(3)
    const rifa = await nuevaRifa('equivalencia', desde, hasta)
    const p = await premio(owner, rifa, {
      titulo: 'Calendario mixto',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [
        tramo(lunes, addDays(lunes, 5), [2, 4]),
        unDia(addDays(lunes, 9), 'meta'),
        tramo(addDays(lunes, 14), addDays(lunes, 19), [1, 5, 6]),
      ],
    })

    const { rows: expansion } = await db.query<{ reference_date: string; lottery_code: Loteria }>(
      `select reference_date::text, lottery_code::text from raffle_prize_rule_dates($1)`,
      [p.versionId],
    )
    const esperados = new Set(expansion.map((e) => `${e.reference_date}:${e.lottery_code}`))
    expect(esperados.size).toBeGreaterThan(0)

    const loterias = Object.keys(NOMINAL) as Loteria[]
    const { rows } = await db.query<{ dia: string; loteria: Loteria; juega: boolean }>(
      `select d::date::text as dia, l as loteria,
              exists (
                select 1 from raffle_prize_draw_prizes(array[$1]::uuid[], d::date, l::lottery_code,
                                                       'infinity'::timestamptz) x
                 where x.version_id = $2
              ) as juega
         from generate_series($3::date, $4::date, interval '1 day') d
        cross join unnest($5::text[]) l`,
      [rifa, p.versionId, desde, hasta, loterias],
    )
    expect(rows).toHaveLength(21 * 6)
    for (const fila of rows) {
      expect(fila.juega, `${fila.dia} ${fila.loteria}`).toBe(
        esperados.has(`${fila.dia}:${fila.loteria}`),
      )
    }
  })
})

// =============================================================================
describe('M4 — la versión histórica: la última publicada antes del corte (BR-J09)', () => {
  it('M4-01: la versión publicada antes del corte aplica, y un cambio publicado después no altera ese sorteo (14, 15)', async () => {
    const { lunes, desde, hasta } = semanas(2)
    const rifa = await nuevaRifa('version corte', desde, hasta)
    const lunes1 = lunes
    const lunes2 = addDays(lunes, 7)
    const base: PremioInput = {
      titulo: 'Cambia de cifras',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(lunes1), unDia(lunes2)],
    }
    const p = await premio(owner, rifa, base)
    await activar(rifa)
    const v1 = p.versionId
    const v2 = await publicar(p.prizeId, v1, { ...base, cifras: 'last_three' })
    const corte = await entre(await publicadaEn(v1), await publicadaEn(v2))

    const [exacta, sufijo] = await boletas(rifa, [
      { diario: '7070', semanal: '0001' },
      { diario: '9070', semanal: '0002' },
    ])

    // Corte ENTRE las dos publicaciones: juega la v1, cuatro cifras.
    const antes = await sorteo('cundinamarca', lunes1, '7070', { original: corte, oficial: corte })
    await buscarBien(antes.resultId)
    const filasAntes = await enlacesDe(antes.resultId)
    expect(pares(filasAntes)).toEqual([par(exacta!, p.prizeId)])
    expect(filasAntes[0]!.prize_version_id).toBe(v1)
    expect(filasAntes[0]!.digits).toBe('four')

    // Corte DESPUÉS de la v2: juega la v2, tres cifras.
    const despues = await sorteo('cundinamarca', lunes2, '7070')
    await buscarBien(despues.resultId)
    const filasDespues = await enlacesDe(despues.resultId)
    expect(pares(filasDespues)).toEqual([par(exacta!, p.prizeId), par(sufijo!, p.prizeId)].sort())
    expect(new Set(filasDespues.map((f) => f.prize_version_id))).toEqual(new Set([v2]))

    // La regla de conjunto y la escalar dicen lo mismo.
    const { rows } = await db.query<{ a: string; b: string }>(
      `select raffle_prize_applicable_version($1, $2::timestamptz) as a,
              (select version_id from raffle_prize_versions_at(array[$1]::uuid[], $2::timestamptz)) as b`,
      [p.prizeId, corte],
    )
    expect(rows[0]).toEqual({ a: v1, b: v1 })
  })

  it('M4-02: si la versión aplicable está ARCHIVADA el premio no juega; si se archivó después del corte, sí (16)', async () => {
    const { lunes, desde, hasta } = semanas(2)
    const rifa = await nuevaRifa('archivada', desde, hasta)
    const lunes1 = lunes
    const lunes2 = addDays(lunes, 7)
    const p = await premio(owner, rifa, {
      titulo: 'Se archiva',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(lunes1), unDia(lunes2)],
    })
    // Una rifa activa conserva al menos un premio vigente (BR-J09).
    await premio(owner, rifa, {
      titulo: 'Se queda',
      campo: 'weekly_number',
      cifras: 'four',
      reglas: [unDia(diaDe(lunes, 'boyaca'))],
    })
    await activar(rifa)
    const v2 = await archivar(p.prizeId, p.versionId)
    const corte = await entre(await publicadaEn(p.versionId), await publicadaEn(v2))
    const [boleta] = await boletas(rifa, [{ diario: '8080', semanal: '0001' }])

    const antesDeArchivar = await sorteo('cundinamarca', lunes1, '8080', {
      original: corte,
      oficial: corte,
    })
    await buscarBien(antesDeArchivar.resultId)
    expect(pares(await enlacesDe(antesDeArchivar.resultId))).toEqual([par(boleta!, p.prizeId)])

    const yaArchivado = await sorteo('cundinamarca', lunes2, '8080')
    const salida = await buscarBien(yaArchivado.resultId)
    expect(await enlacesDe(yaArchivado.resultId)).toEqual([])
    expect(salida).toMatchObject({ inserted: 0, prize_links: 0 })
  })

  it('M4-03: un sorteo APLAZADO conserva el corte original, y el instante oficial sigue decidiendo la venta (17)', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('aplazado', desde, hasta)
    const base: PremioInput = {
      titulo: 'Aplazado',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(lunes)],
    }
    const p = await premio(owner, rifa, base)
    await activar(rifa)
    const v2 = await publicar(p.prizeId, p.versionId, { ...base, cifras: 'last_three' })
    const original = await entre(await publicadaEn(p.versionId), await publicadaEn(v2))
    const oficial = horaDe(addDays(lunes, 2))
    // Vendida DESPUÉS del corte original y ANTES del instante oficial.
    const [exacta, sufijo] = await boletas(rifa, [
      {
        diario: '9191',
        semanal: '0001',
        cliente: ctx.clients.beatriz.id,
        vendidaEn: horaDe(lunes),
      },
      { diario: '0191', semanal: '0002' },
    ])

    const { resultId } = await sorteo('cundinamarca', lunes, '9191', {
      original,
      oficial,
      estado: 'rescheduled_later',
    })
    await buscarBien(resultId)

    const filas = await enlacesDe(resultId)
    expect(pares(filas)).toEqual([par(exacta!, p.prizeId)])
    expect(filas[0]).toMatchObject({
      prize_version_id: p.versionId,
      assignment_status: 'sold',
      client_id: ctx.clients.beatriz.id,
    })
    expect(filas.map((f) => f.ticket_id)).not.toContain(sufijo)
  })

  it('M4-04: sin hora original no se supone nada: falla y no escribe ni lo de las rifas heredadas', async () => {
    const { lunes, desde, hasta } = semanas()
    const heredada = await nuevaRifa('sin corte heredada', desde, hasta, { modo: 'legacy' })
    await activar(heredada)
    const configurable = await nuevaRifa('sin corte configurable', desde, hasta)
    await premio(owner, configurable, {
      titulo: 'Sin corte',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(diaDe(lunes, 'bogota'))],
    })
    await activar(configurable)
    await boletas(heredada, [{ diario: '1212', semanal: '0001' }])
    await boletas(configurable, [{ diario: '1212', semanal: '0001' }])

    const { resultId } = await sorteo('bogota', diaDe(lunes, 'bogota'), '1212', { original: null })
    const { error } = await buscar(resultId)

    expect(error?.message).toContain('hora original anunciada')
    expect(error?.code).toBe('22000')
    expect(await enlacesDe(resultId)).toEqual([])
  })
})

// =============================================================================
describe('M5 — cuatro cifras mandan sobre tres, POR CLIENTE (BR-J07, D-203)', () => {
  it('M5-01: Ana gana el mayor con 1234 y NO recibe el de tres cifras por su 9234; Carlos, Diego y una boleta libre sí (18, 19)', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('ana', desde, hasta)
    const fecha = diaDe(lunes, 'cundinamarca')
    const mayor = await premio(owner, rifa, {
      titulo: 'Mayor',
      categoria: 'main',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(fecha, 'cundinamarca')],
    })
    const tres = await premio(owner, rifa, {
      titulo: 'Tres cifras',
      categoria: 'special',
      campo: 'daily_number',
      cifras: 'last_three',
      reglas: [unDia(fecha)],
    })
    await activar(rifa)
    const [ana1234, ana9234, carlos5234, beatriz6234, diego7234, libre0234] = await boletas(rifa, [
      { diario: '1234', semanal: '0001', cliente: ctx.clients.ana.id },
      { diario: '9234', semanal: '0002', cliente: ctx.clients.ana.id },
      { diario: '5234', semanal: '0003', cliente: ctx.clients.carlos.id },
      { diario: '6234', semanal: '0004', cliente: ctx.clients.beatriz.id },
      { diario: '7234', semanal: '0005', vendedor: 'seller2', cliente: ctx.clients.diego.id },
      { diario: '0234', semanal: '0006' },
    ])
    const { resultId } = await sorteo('cundinamarca', fecha, '1234')
    await buscarBien(resultId)

    const filas = await enlacesDe(resultId)
    expect(pares(filas)).toEqual(
      [
        par(ana1234!, mayor.prizeId),
        par(carlos5234!, tres.prizeId),
        par(beatriz6234!, tres.prizeId),
        par(diego7234!, tres.prizeId),
        par(libre0234!, tres.prizeId),
      ].sort(),
    )
    // La boleta descartada no se fotografía: no es una coincidencia.
    expect(filas.map((f) => f.ticket_id)).not.toContain(ana9234)
    // Y la 1234 de Ana no conserva además el de tres cifras, aunque su sufijo coincide.
    expect(filas.filter((f) => f.ticket_id === ana1234)).toHaveLength(1)
    // Dos clientes distintos nunca se mezclan, tampoco con el mismo vendedor.
    expect(filas.find((f) => f.ticket_id === beatriz6234)?.client_id).toBe(ctx.clients.beatriz.id)
  })

  it('M5-02: pierde también las de tres cifras del OTRO número de otra boleta suya', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('otro numero', desde, hasta)
    const fecha = diaDe(lunes, 'cruz_roja')
    const mayor = await premio(owner, rifa, {
      titulo: 'Cuatro diario',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(fecha)],
    })
    const semanalTres = await premio(owner, rifa, {
      titulo: 'Tres semanal',
      campo: 'weekly_number',
      cifras: 'last_three',
      reglas: [unDia(fecha)],
    })
    await activar(rifa)
    const [misma, otra, deCarlos] = await boletas(rifa, [
      // La misma boleta: su diario gana cuatro y su semanal coincide en tres.
      { diario: '4321', semanal: '0321', cliente: ctx.clients.ana.id },
      { diario: '0001', semanal: '8321', cliente: ctx.clients.ana.id },
      { diario: '0002', semanal: '5321', cliente: ctx.clients.carlos.id },
    ])
    const { resultId } = await sorteo('cruz_roja', fecha, '4321')
    await buscarBien(resultId)

    const filas = await enlacesDe(resultId)
    expect(pares(filas)).toEqual(
      [par(misma!, mayor.prizeId), par(deCarlos!, semanalTres.prizeId)].sort(),
    )
    expect(filas.map((f) => f.ticket_id)).not.toContain(otra)
    expect(filas.filter((f) => f.ticket_id === misma).map((f) => f.match_field)).toEqual([
      'daily_number',
    ])
  })

  it('M5-03: cuatro cifras por el diario y por el semanal conviven, en la misma boleta y en otra (20)', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('dos cuatro', desde, hasta)
    const fecha = diaDe(lunes, 'medellin')
    const diario = await premio(owner, rifa, {
      titulo: 'Diario',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(fecha)],
    })
    const semanal = await premio(owner, rifa, {
      titulo: 'Semanal',
      categoria: 'weekly',
      campo: 'weekly_number',
      cifras: 'four',
      reglas: [unDia(fecha)],
    })
    await activar(rifa)
    const [lasDos, soloDiario] = await boletas(rifa, [
      { diario: '6543', semanal: '6543', cliente: ctx.clients.ana.id },
      { diario: '6543', semanal: '0001', cliente: ctx.clients.ana.id },
    ])
    const { resultId } = await sorteo('medellin', fecha, '6543')
    const salida = await buscarBien(resultId)

    const filas = await enlacesDe(resultId)
    expect(pares(filas)).toEqual(
      [
        par(lasDos!, diario.prizeId),
        par(lasDos!, semanal.prizeId),
        par(soloDiario!, diario.prizeId),
      ].sort(),
    )
    expect(
      filas
        .filter((f) => f.ticket_id === lasDos)
        .map((f) => f.match_field)
        .sort(),
    ).toEqual(['daily_number', 'weekly_number'])
    expect(salida).toMatchObject({ inserted: 3, prize_links: 3 })
  })

  it('M5-04: la identidad es la FOTOGRAFIADA: una boleta de Ana vendida después del sorteo es su propia unidad', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('identidad', desde, hasta)
    const fecha = diaDe(lunes, 'bogota')
    const mayor = await premio(owner, rifa, {
      titulo: 'Mayor',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(fecha)],
    })
    const tres = await premio(owner, rifa, {
      titulo: 'Tres',
      campo: 'daily_number',
      cifras: 'last_three',
      reglas: [unDia(fecha)],
    })
    await activar(rifa)
    const [gana, tarde] = await boletas(rifa, [
      { diario: '2468', semanal: '0001', cliente: ctx.clients.ana.id },
      // Hoy es de Ana, pero la vendió DESPUÉS del sorteo: la fotografía no la liga a ella.
      {
        diario: '0468',
        semanal: '0002',
        cliente: ctx.clients.ana.id,
        vendidaEn: horaDe(addDays(fecha, 1)),
      },
    ])
    const { resultId } = await sorteo('bogota', fecha, '2468')
    await buscarBien(resultId)

    const filas = await enlacesDe(resultId)
    expect(pares(filas)).toEqual([par(gana!, mayor.prizeId), par(tarde!, tres.prizeId)].sort())
    expect(filas.find((f) => f.ticket_id === tarde)).toMatchObject({
      assignment_status: 'late_assignment',
      client_id: null,
    })
  })

  it('M5-05: la prioridad no cruza rifas: el mismo cliente conserva el de tres cifras de OTRA rifa', async () => {
    const { lunes, desde, hasta } = semanas()
    const fecha = diaDe(lunes, 'meta')
    const rifaA = await nuevaRifa('cruce A', desde, hasta)
    const rifaB = await nuevaRifa('cruce B', desde, hasta)
    const mayorA = await premio(owner, rifaA, {
      titulo: 'Mayor A',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(fecha)],
    })
    const tresB = await premio(owner, rifaB, {
      titulo: 'Tres B',
      campo: 'daily_number',
      cifras: 'last_three',
      reglas: [unDia(fecha)],
    })
    await activar(rifaA)
    await activar(rifaB)
    const [enA] = await boletas(rifaA, [
      { diario: '1357', semanal: '0001', cliente: ctx.clients.ana.id },
    ])
    const [enB] = await boletas(rifaB, [
      { diario: '9357', semanal: '0001', cliente: ctx.clients.ana.id },
    ])
    const { resultId } = await sorteo('meta', fecha, '1357')
    await buscarBien(resultId)

    expect(pares(await enlacesDe(resultId))).toEqual(
      [par(enA!, mayorA.prizeId), par(enB!, tresB.prizeId)].sort(),
    )
  })

  it('M5-06: la base rechaza un enlace escrito a mano que rompería la prioridad, y una fotografía configurable sin enlace', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('defensa prioridad', desde, hasta)
    const fecha = diaDe(lunes, 'medellin')
    await premio(owner, rifa, {
      titulo: 'Mayor',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(fecha)],
    })
    const tres = await premio(owner, rifa, {
      titulo: 'Tres',
      campo: 'daily_number',
      cifras: 'last_three',
      reglas: [unDia(fecha)],
    })
    await activar(rifa)
    const [, descartada] = await boletas(rifa, [
      { diario: '1470', semanal: '0001', cliente: ctx.clients.ana.id },
      { diario: '9470', semanal: '0002', cliente: ctx.clients.ana.id },
    ])
    const { resultId } = await sorteo('medellin', fecha, '1470')
    await buscarBien(resultId)

    const insertarFotografia = `
      insert into lottery_ticket_matches (result_id, ticket_id, organization_id, raffle_id, seller_id,
        client_id, match_field, matched_number, assignment_status, inventory_status_at_draw, assigned_at,
        ticket_created_at)
      select $1, t.id, t.organization_id, t.raffle_id, t.seller_id, t.client_id, 'daily_number',
             t.daily_number, 'sold', 'assigned', t.assigned_at, t.created_at
        from tickets t where t.id = $2`

    await expect(
      db.query(
        `with m as (${insertarFotografia} returning id, organization_id, raffle_id)
         insert into lottery_ticket_match_prizes (organization_id, raffle_id, result_id, match_id,
           match_field, prize_id, prize_version_id)
         select m.organization_id, m.raffle_id, $1, m.id, 'daily_number', $3, $4 from m`,
        [resultId, descartada, tres.prizeId, tres.versionId],
      ),
    ).rejects.toThrow(/no puede conservar un premio de tres cifras/)

    await expect(db.query(insertarFotografia, [resultId, descartada])).rejects.toThrow(
      /se guarda junto con el premio/,
    )
    expect((await enlacesDe(resultId)).map((f) => f.ticket_id)).not.toContain(descartada)
  })
})

// =============================================================================
describe('M6 — una configuración imposible falla entera (BR-J08, 21)', () => {
  /** Un segundo premio con la MISMA firma, escrito sin pasar por las RPC. */
  async function premioImposible(rifa: string, fecha: string): Promise<string> {
    const { rows } = await db.query<{ prize_id: string }>(
      `with v as (
         insert into raffle_prize_versions (organization_id, raffle_id, prize_id, version_number,
           status, title, category, number_field, digits, reward_mode)
         values ($1, $2, gen_random_uuid(), 1, 'active', 'Duplicado imposible', 'special',
                 'daily_number', 'four', 'fixed')
         returning id, prize_id
       ), reglas as (
         insert into raffle_prize_schedule_rules (organization_id, version_id, position, start_date,
           end_date, weekdays, lottery_mode)
         select $1, v.id, 1, $3::date, $3::date, array[extract(isodow from $3::date)::smallint],
                'corresponding'
           from v
       ), opciones as (
         insert into raffle_prize_reward_options (organization_id, version_id, position, amount)
         select $1, v.id, 1, 1000000 from v
       )
       insert into raffle_prizes (id, organization_id, raffle_id, status, position, current_version_id)
       select v.prize_id, $1, $2, 'active', 99, v.id from v
       returning id as prize_id`,
      [ctx.demoOrg.id, rifa, fecha],
    )
    return rows[0]!.prize_id
  }

  it('M6-01: dos premios con la misma firma: no elige ninguno, no escribe nada —tampoco lo heredado ni el resultado— y dice por qué sin datos de clientes', async () => {
    const { lunes, desde, hasta } = semanas()
    const fecha = diaDe(lunes, 'cundinamarca')
    const heredada = await nuevaRifa('imposible heredada', desde, hasta, { modo: 'legacy' })
    await activar(heredada)
    const rifa = await nuevaRifa('imposible', desde, hasta)
    const legitimo = await premio(owner, rifa, {
      titulo: 'Legítimo',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(fecha)],
    })
    await activar(rifa)
    const duplicado = await premioImposible(rifa, fecha)
    await boletas(heredada, [{ diario: '3690', semanal: '0001', cliente: ctx.clients.ana.id }])
    await boletas(rifa, [{ diario: '3690', semanal: '0001', cliente: ctx.clients.ana.id }])

    // Por el camino real: confirmar el resultado ES buscar coincidencias y avisar.
    const { drawNumber, scheduleId } = await programacion('cundinamarca', fecha)
    const { error } = await ctx.svc.rpc('confirm_lottery_result', {
      p_lottery_code: 'cundinamarca',
      p_draw_number: drawNumber,
      p_winning_number: '3690',
    })

    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('no se puede decidir cuál aplica')
    expect(error?.details).toContain(legitimo.prizeId)
    expect(error?.details).toContain(duplicado)
    expect(error?.details).not.toMatch(/Ana|Torres|@|300 /)
    expect(error?.hint).toContain('BR-J08')
    expect(
      await contar(`select count(*)::int as n from lottery_results where schedule_id = $1`, [
        scheduleId,
      ]),
    ).toBe(0)
    expect(
      await contar(
        `select count(*)::int as n from lottery_ticket_matches where raffle_id = any ($1::uuid[])`,
        [[heredada, rifa]],
      ),
    ).toBe(0)
    expect(
      await contar(
        `select count(*)::int as n from lottery_draw_schedules where id = $1 and schedule_status = 'completed'`,
        [scheduleId],
      ),
    ).toBe(0)
  })

  it('M6-02: falla aunque ninguna boleta coincida: la duda es de la configuración, no de las boletas', async () => {
    const { lunes, desde, hasta } = semanas()
    const fecha = diaDe(lunes, 'bogota')
    const rifa = await nuevaRifa('imposible sin boletas', desde, hasta)
    await premio(owner, rifa, {
      titulo: 'Legítimo',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(fecha)],
    })
    await activar(rifa)
    await premioImposible(rifa, fecha)

    const { resultId } = await sorteo('bogota', fecha, '0000')
    const { error } = await buscar(resultId)
    expect(error?.message).toContain('no se puede decidir cuál aplica')
  })
})

// =============================================================================
describe('M7 — reintentos, concurrencia y nada de reprocesar (22, 23, 28)', () => {
  it('M7-01: un reintento deja exactamente el mismo estado', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('reintento', desde, hasta)
    const fecha = diaDe(lunes, 'cruz_roja')
    await premio(owner, rifa, {
      titulo: 'Mayor',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(fecha)],
    })
    await premio(owner, rifa, {
      titulo: 'Tres',
      campo: 'daily_number',
      cifras: 'last_three',
      reglas: [unDia(fecha)],
    })
    await activar(rifa)
    await boletas(rifa, [
      { diario: '1590', semanal: '0001', cliente: ctx.clients.ana.id },
      { diario: '0590', semanal: '0002', cliente: ctx.clients.carlos.id },
      { diario: '7590', semanal: '0003' },
    ])
    const { resultId } = await sorteo('cruz_roja', fecha, '1590')

    const primera = await buscarBien(resultId)
    const antes = await enlacesDe(resultId)
    const segunda = await buscarBien(resultId)
    const despues = await enlacesDe(resultId)

    expect(primera).toMatchObject({ inserted: 3, prize_links: 3 })
    expect(segunda).toMatchObject({ inserted: 0, prize_links: 0 })
    expect(despues).toEqual(antes)
  })

  it('M7-02: dos ejecuciones a la vez: la segunda espera al cerrojo y no duplica nada', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('concurrencia', desde, hasta)
    const fecha = diaDe(lunes, 'meta')
    await premio(owner, rifa, {
      titulo: 'Mayor',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(fecha)],
    })
    await premio(owner, rifa, {
      titulo: 'Tres',
      campo: 'weekly_number',
      cifras: 'last_three',
      reglas: [unDia(fecha)],
    })
    await activar(rifa)
    await boletas(rifa, [
      { diario: '2580', semanal: '0580', cliente: ctx.clients.ana.id },
      { diario: '0001', semanal: '9580', cliente: ctx.clients.carlos.id },
    ])
    const { resultId } = await sorteo('meta', fecha, '2580')

    const a = new PgClient({ connectionString: DB_URL })
    const b = new PgClient({ connectionString: DB_URL })
    await a.connect()
    await b.connect()
    try {
      const { rows: pid } = await b.query<{ pid: number }>('select pg_backend_pid() as pid')
      await a.query('begin')
      await a.query('select match_lottery_result($1)', [resultId])

      const pendiente = b.query<{ r: { inserted: number; prize_links: number } }>(
        'select match_lottery_result($1) as r',
        [resultId],
      )

      let bloqueada = false
      for (let i = 0; i < 60 && !bloqueada; i += 1) {
        const { rows } = await db.query<{ wait_event_type: string | null }>(
          `select wait_event_type from pg_stat_activity where pid = $1`,
          [pid[0]!.pid],
        )
        bloqueada = rows[0]?.wait_event_type === 'Lock'
        if (!bloqueada) await esperar(50)
      }
      expect(bloqueada, 'la segunda ejecución tenía que esperar al cerrojo').toBe(true)

      await a.query('commit')
      const { rows } = await pendiente
      expect(rows[0]!.r).toMatchObject({ inserted: 0, prize_links: 0 })
    } finally {
      await a.end()
      await b.end()
    }

    const filas = await enlacesDe(resultId)
    expect(filas).toHaveLength(2)
    expect(new Set(filas.map((f) => f.match_id)).size).toBe(2)
  })

  it('M7-03: la migración no enlazó nada heredado, y cambiar premios después del sorteo no reprocesa ni altera lo guardado', async () => {
    // Ningún enlace apunta a una rifa que no sea configurable.
    expect(
      await contar(
        `select count(*)::int as n
           from lottery_ticket_match_prizes l join raffles r on r.id = l.raffle_id
          where r.prize_mode <> 'configurable'`,
        [],
      ),
    ).toBe(0)

    const { lunes, desde, hasta } = semanas(2)
    const rifa = await nuevaRifa('sin reproceso', desde, hasta)
    const base: PremioInput = {
      titulo: 'Mayor',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(lunes), unDia(addDays(lunes, 7))],
    }
    const p = await premio(owner, rifa, base)
    await premio(owner, rifa, {
      titulo: 'Otro',
      campo: 'weekly_number',
      cifras: 'four',
      reglas: [unDia(diaDe(lunes, 'boyaca'))],
    })
    await activar(rifa)
    const [exacta] = await boletas(rifa, [
      { diario: '3579', semanal: '0001', cliente: ctx.clients.ana.id },
      { diario: '9579', semanal: '0002', cliente: ctx.clients.carlos.id },
    ])
    // El sorteo se jugó AHORA: después de la versión 1 y antes de todo lo que se
    // publique a partir de aquí.
    const { rows: reloj } = await db.query<{ t: string }>(`select clock_timestamp()::text as t`)
    const ahora = reloj[0]!.t
    const { resultId } = await sorteo('cundinamarca', lunes, '3579', {
      original: ahora,
      oficial: ahora,
    })
    await buscarBien(resultId)
    const antes = await enlacesDe(resultId)
    expect(pares(antes)).toEqual([par(exacta!, p.prizeId)])

    // Después del sorteo: se cambia el premio y aparece uno nuevo de tres cifras ese mismo día.
    await publicar(p.prizeId, p.versionId, { ...base, cifras: 'last_three' })
    await premio(owner, rifa, {
      titulo: 'Nuevo de tres',
      campo: 'weekly_number',
      cifras: 'last_three',
      reglas: [unDia(lunes)],
    })

    // Nada se recalcula solo…
    expect(await enlacesDe(resultId)).toEqual(antes)
    // …y un reintento tampoco usa la configuración posterior.
    expect(await buscarBien(resultId)).toMatchObject({ inserted: 0, prize_links: 0 })
    expect(await enlacesDe(resultId)).toEqual(antes)
  })
})

// =============================================================================
describe('M8 — organizaciones, RLS, permisos e inmutabilidad (24, 25)', () => {
  let resultId: string
  let demoRifa: string
  let controlRifa: string
  let deVendedor1: string
  let deVendedor2: string
  let deControl: string
  let demoPremio: { prizeId: string; versionId: string }
  /** Un segundo premio de la rifa demo, sin enlace: así la clave única no tapa la FK. */
  let demoOtro: { prizeId: string; versionId: string }
  let controlPremio: { prizeId: string; versionId: string }

  beforeAll(async () => {
    const { lunes, desde, hasta } = semanas()
    const fecha = diaDe(lunes, 'boyaca')
    demoRifa = await nuevaRifa('rls demo', desde, hasta)
    controlRifa = await nuevaRifa('rls control', desde, hasta, { org: 'control' })
    demoPremio = await premio(owner, demoRifa, {
      titulo: 'Demo',
      campo: 'weekly_number',
      cifras: 'four',
      reglas: [unDia(fecha)],
    })
    demoOtro = await premio(owner, demoRifa, {
      titulo: 'Demo lunes',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(lunes)],
    })
    controlPremio = await premio(otherOrgOwner, controlRifa, {
      titulo: 'Control',
      campo: 'weekly_number',
      cifras: 'four',
      reglas: [unDia(fecha)],
    })
    await activar(demoRifa)
    await activar(controlRifa)
    const demo = await boletas(demoRifa, [
      { diario: '0001', semanal: '8642', cliente: ctx.clients.ana.id },
      { diario: '0002', semanal: '8642', vendedor: 'seller2', cliente: ctx.clients.diego.id },
    ])
    deVendedor1 = demo[0]!
    deVendedor2 = demo[1]!
    deControl = (
      await boletas(controlRifa, [
        { diario: '0001', semanal: '8642', vendedor: 'control', cliente: ctx.clients.fabio.id },
      ])
    )[0]!
    resultId = (await sorteo('boyaca', fecha, '8642')).resultId
    await buscarBien(resultId)
  }, 60_000)

  it('M8-01: cada organización tiene sus fotografías y sus enlaces, con su organización y su rifa', async () => {
    const filas = await enlacesDe(resultId)
    expect(pares(filas)).toEqual(
      [
        par(deVendedor1, demoPremio.prizeId),
        par(deVendedor2, demoPremio.prizeId),
        par(deControl, controlPremio.prizeId),
      ].sort(),
    )
    const { rows } = await db.query<{ ok: boolean }>(
      `select bool_and(l.organization_id = m.organization_id and l.raffle_id = m.raffle_id
                       and p.organization_id = l.organization_id and p.raffle_id = l.raffle_id) as ok
         from lottery_ticket_match_prizes l
         join lottery_ticket_matches m on m.id = l.match_id
         join raffle_prizes p on p.id = l.prize_id
        where l.result_id = $1`,
      [resultId],
    )
    expect(rows[0]!.ok).toBe(true)
  })

  it('M8-02: las claves impiden un enlace entre organizaciones, entre rifas o entre números', async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from lottery_ticket_matches where result_id = $1 and ticket_id = $2`,
      [resultId, deVendedor1],
    )
    const matchId = rows[0]!.id
    const insertar = (
      org: string,
      rifa: string,
      campo: string,
      prizeId: string,
      versionId: string,
    ) =>
      db.query(
        `insert into lottery_ticket_match_prizes (organization_id, raffle_id, result_id, match_id,
           match_field, prize_id, prize_version_id)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [org, rifa, resultId, matchId, campo, prizeId, versionId],
      )

    // El premio de otra organización, con la organización de la fotografía.
    await expect(
      insertar(
        ctx.demoOrg.id,
        demoRifa,
        'weekly_number',
        controlPremio.prizeId,
        controlPremio.versionId,
      ),
    ).rejects.toMatchObject({ code: '23503' })
    // El premio de otra organización, con su organización.
    await expect(
      insertar(
        ctx.controlOrg.id,
        controlRifa,
        'weekly_number',
        controlPremio.prizeId,
        controlPremio.versionId,
      ),
    ).rejects.toMatchObject({ code: '23503' })
    // La fotografía del número semanal no se ata al número diario.
    await expect(
      insertar(ctx.demoOrg.id, demoRifa, 'daily_number', demoOtro.prizeId, demoOtro.versionId),
    ).rejects.toMatchObject({ code: '23503' })
    // Una versión de otro premio.
    await expect(
      insertar(ctx.demoOrg.id, demoRifa, 'weekly_number', demoOtro.prizeId, demoPremio.versionId),
    ).rejects.toMatchObject({ code: '23503' })
    // Y con todo en regla salvo la regla: la versión del lunes no juega con el
    // número semanal de un sábado, y lo dice el disparador de comprobación.
    await expect(
      insertar(ctx.demoOrg.id, demoRifa, 'weekly_number', demoOtro.prizeId, demoOtro.versionId),
    ).rejects.toThrow(/no es el que aplica a este sorteo/)
  })

  it('M8-03: el vendedor lee los enlaces de SUS coincidencias; ni el otro vendedor ni el personal ni otra organización ni anon', async () => {
    const leer = (c: Client) =>
      c
        .from('lottery_ticket_match_prizes')
        .select('match_id, prize_id, prize_version_id')
        .eq('result_id', resultId)

    const propios = await leer(seller1)
    expect(propios.error).toBeNull()
    expect(propios.data).toHaveLength(1)

    const { data: matchesSeller1 } = await seller1
      .from('lottery_ticket_matches')
      .select('id, ticket_id')
      .eq('result_id', resultId)
    expect(matchesSeller1!.map((m) => m.ticket_id)).toEqual([deVendedor1])
    expect(propios.data![0]!.match_id).toBe(matchesSeller1![0]!.id)

    const ajenos = await leer(seller2)
    expect(ajenos.error).toBeNull()
    expect(ajenos.data).toHaveLength(1)
    expect(ajenos.data![0]!.match_id).not.toBe(propios.data![0]!.match_id)

    for (const personal of [owner, admin, otherOrgOwner]) {
      const { data, error } = await leer(personal)
      expect(error).toBeNull()
      expect(data).toEqual([])
    }

    const control = await leer(otherOrgSeller)
    expect(control.data).toHaveLength(1)
    expect(control.data![0]!.prize_id).toBe(controlPremio.prizeId)

    const { error: anonError } = await leer(anonClient())
    expect(anonError).not.toBeNull()
  })

  it('M8-04: nadie escribe enlaces ni ejecuta el motor desde una sesión; ni la service role modifica o borra', async () => {
    const fila = {
      organization_id: ctx.demoOrg.id,
      raffle_id: demoRifa,
      result_id: resultId,
      match_id: '00000000-0000-0000-0000-000000000001',
      match_field: 'weekly_number' as const,
      prize_id: demoPremio.prizeId,
      prize_version_id: demoPremio.versionId,
    }
    for (const c of [seller1, owner, admin, anonClient(), ctx.svc]) {
      const { error } = await c.from('lottery_ticket_match_prizes').insert(fila)
      expect(error).not.toBeNull()
    }

    const { error: actualizar } = await ctx.svc
      .from('lottery_ticket_match_prizes')
      .update({ prize_version_id: demoPremio.versionId })
      .eq('result_id', resultId)
    expect(actualizar).not.toBeNull()
    const { error: borrar } = await ctx.svc
      .from('lottery_ticket_match_prizes')
      .delete()
      .eq('result_id', resultId)
    expect(borrar).not.toBeNull()

    // Ni siquiera PostgreSQL directo: el disparador de inmutabilidad.
    await expect(
      db.query(`update lottery_ticket_match_prizes set created_at = now() where result_id = $1`, [
        resultId,
      ]),
    ).rejects.toThrow(/no se modifican ni se borran/)
    await expect(
      db.query(`delete from lottery_ticket_match_prizes where result_id = $1`, [resultId]),
    ).rejects.toThrow(/no se modifican ni se borran/)

    for (const c of [seller1, owner, admin, anonClient()]) {
      const motor = await c.rpc('match_lottery_result', { p_result_id: resultId })
      expect(motor.error).not.toBeNull()
      const confirmar = await c.rpc('confirm_lottery_result', {
        p_lottery_code: 'boyaca',
        p_draw_number: 'no-existe',
        p_winning_number: '0000',
      })
      expect(confirmar.error).not.toBeNull()
    }
    expect(await enlacesDe(resultId)).toHaveLength(3)
  })

  it('M8-05: el catálogo: RLS forzada, una sola política de SELECT, privilegios justos y funciones internas', async () => {
    const { rows: tabla } = await db.query<{ forzada: boolean; habilitada: boolean }>(
      `select relforcerowsecurity as forzada, relrowsecurity as habilitada
         from pg_class where oid = 'public.lottery_ticket_match_prizes'::regclass`,
    )
    expect(tabla[0]).toEqual({ forzada: true, habilitada: true })

    const { rows: politicas } = await db.query<{ cmd: string }>(
      `select cmd from pg_policies where schemaname = 'public' and tablename = 'lottery_ticket_match_prizes'`,
    )
    expect(politicas.map((p) => p.cmd)).toEqual(['SELECT'])

    const { rows: privilegios } = await db.query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'lottery_ticket_match_prizes'
          and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
        order by grantee, privilege_type`,
    )
    expect(privilegios).toEqual([
      { grantee: 'authenticated', privilege_type: 'SELECT' },
      { grantee: 'service_role', privilege_type: 'SELECT' },
    ])

    const internas = [
      'lottery_ticket_match_prizes_check',
      'lottery_ticket_match_prizes_immutable',
      'lottery_ticket_matches_prize_links_check',
      'match_lottery_result',
      'confirm_lottery_result',
      'raffle_prize_applicable_version',
      'raffle_prize_cutoff_problem',
      'raffle_prize_draw_cutoff',
      'raffle_prize_draw_prizes',
      'raffle_prize_versions_at',
    ]
    const { rows: ejecutables } = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1)
          and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
               or has_function_privilege('anon', p.oid, 'EXECUTE')
               or has_function_privilege('public', p.oid, 'EXECUTE'))`,
      [internas],
    )
    expect(ejecutables).toEqual([])

    const { rows: motor } = await db.query<{ ok: boolean }>(
      `select has_function_privilege('service_role', 'match_lottery_result(uuid)', 'EXECUTE') as ok`,
    )
    expect(motor[0]!.ok).toBe(true)
  })

  it('M8-06: la lectura del personal sigue sin cliente, y ninguna pieza nueva devuelve nada de la cartera (D-198)', async () => {
    const { data, error } = await owner.rpc('admin_lottery_matches', { p_result_ids: [resultId] })
    expect(error).toBeNull()
    expect(data!.map((r) => r.ticket_id).sort()).toEqual([deVendedor1, deVendedor2].sort())
    for (const fila of data!) expect(fila).not.toHaveProperty('client_id')

    const { rows: columnas } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'lottery_ticket_match_prizes'`,
    )
    const PROHIBIDAS =
      /client|sale_price|base_price|paid|pending|payment|amount|phone|email|option|alternative|reward/
    for (const c of columnas) expect(c.column_name).not.toMatch(PROHIBIDAS)

    const { rows: resultados } = await db.query<{ resultado: string }>(
      `select pg_get_function_result(p.oid) as resultado from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('raffle_prize_draw_prizes', 'raffle_prize_versions_at')`,
    )
    expect(resultados).toHaveLength(2)
    for (const r of resultados) expect(r.resultado).not.toMatch(PROHIBIDAS)
  })
})

// =============================================================================
describe('M9 — la fotografía manda después del sorteo (26, 27)', () => {
  it('M9-01: cambiar cliente o vendedor después no cambia la fotografía ni su premio, y la boleta queda bloqueada', async () => {
    const { lunes, desde, hasta } = semanas()
    const rifa = await nuevaRifa('fotografia', desde, hasta)
    const fecha = diaDe(lunes, 'medellin')
    const mayor = await premio(owner, rifa, {
      titulo: 'Mayor',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(fecha)],
    })
    const tres = await premio(owner, rifa, {
      titulo: 'Tres',
      campo: 'daily_number',
      cifras: 'last_three',
      reglas: [unDia(fecha)],
    })
    await activar(rifa)
    const [vendida, libre, descartada] = await boletas(rifa, [
      { diario: '4680', semanal: '0001', cliente: ctx.clients.ana.id },
      { diario: '0680', semanal: '0002' },
      { diario: '9680', semanal: '0003', cliente: ctx.clients.ana.id },
    ])
    const { resultId } = await sorteo('medellin', fecha, '4680')
    await buscarBien(resultId)
    const antes = await enlacesDe(resultId)
    expect(pares(antes)).toEqual([par(vendida!, mayor.prizeId), par(libre!, tres.prizeId)].sort())

    // Después del sorteo, por PostgreSQL directo —las pantallas no lo permiten—.
    await db.query(`update tickets set client_id = $2 where id = $1`, [
      vendida,
      ctx.clients.carlos.id,
    ])
    await db.query(`update tickets set seller_id = $2 where id = $1`, [libre, ctx.ids.seller2])

    const despues = await enlacesDe(resultId)
    expect(despues).toEqual(antes)
    expect(despues.find((f) => f.ticket_id === vendida)).toMatchObject({
      client_id: ctx.clients.ana.id,
      seller_id: ctx.ids.seller1,
      prize_version_id: mayor.versionId,
    })
    expect(despues.find((f) => f.ticket_id === libre)!.seller_id).toBe(ctx.ids.seller1)

    // La boleta con premio ya no cambia de cliente ni se libera (BR-I13, BR-I14).
    await db.query(`update tickets set client_id = $2 where id = $1`, [vendida, ctx.clients.ana.id])
    const cambio = await seller1.rpc('reassign_ticket_client', {
      p_ticket_id: vendida!,
      p_expected_client_id: ctx.clients.ana.id,
      p_new_client_id: ctx.clients.carlos.id,
      p_reason: 'Prueba del motor de premios',
    })
    expect(cambio.error?.message).toContain('ya hace parte de un resultado registrado')
    const liberar = await seller1.rpc('release_ticket_client', {
      p_ticket_id: vendida!,
      p_expected_client_id: ctx.clients.ana.id,
      p_reason: 'Prueba del motor de premios',
    })
    expect(liberar.error?.message).toContain('ya hace parte de un resultado registrado')

    // La descartada por la prioridad no es una coincidencia: no queda bloqueada (D-203).
    const corregir = await seller1.rpc('reassign_ticket_client', {
      p_ticket_id: descartada!,
      p_expected_client_id: ctx.clients.ana.id,
      p_new_client_id: ctx.clients.carlos.id,
      p_reason: 'Prueba del motor de premios',
    })
    expect(corregir.error).toBeNull()
  })
})

// =============================================================================
describe('M10 — volumen: 5.000 boletas sin una consulta por fila (29)', () => {
  it('M10-01: coincide con `resolvePrizeLinks` enlace por enlace y ninguna función se llama por boleta', async () => {
    const { lunes, desde, hasta } = semanas()
    const fecha = diaDe(lunes, 'cundinamarca')
    const ganador = '4242'
    const rifa = await nuevaRifa('volumen', desde, hasta)
    const premios = {
      diarioCuatro: await premio(owner, rifa, {
        titulo: 'Diario cuatro',
        campo: 'daily_number',
        cifras: 'four',
        reglas: [unDia(fecha)],
      }),
      semanalCuatro: await premio(owner, rifa, {
        titulo: 'Semanal cuatro',
        campo: 'weekly_number',
        cifras: 'four',
        reglas: [unDia(fecha)],
      }),
      diarioTres: await premio(owner, rifa, {
        titulo: 'Diario tres',
        campo: 'daily_number',
        cifras: 'last_three',
        reglas: [unDia(fecha)],
      }),
      semanalTres: await premio(owner, rifa, {
        titulo: 'Semanal tres',
        campo: 'weekly_number',
        cifras: 'last_three',
        reglas: [unDia(fecha)],
      }),
    }
    await activar(rifa)

    // 5.000 boletas deterministas: el diario recorre 0000..4999 y se repite con
    // otro semanal; hay coincidencias de cuatro y de tres en los dos números.
    await db.query(
      `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number,
                            weekly_number, inventory_status, created_at)
       select $1, $2, case when g % 2 = 0 then $3::uuid else $4::uuid end, $5,
              case when g % 50 = 0 then $7 else lpad(((g * 7919) % 10000)::text, 4, '0') end,
              lpad(((g * 104729 + 17) % 10000)::text, 4, '0'),
              'available', $6
         from generate_series(1, 5000) g`,
      [ctx.demoOrg.id, rifa, ctx.ids.seller1, ctx.ids.seller2, ctx.ids.owner, CREADA, ganador],
    )
    // Vendidas: la mitad de las que coinciden —así un mismo cliente acumula
    // coincidencias de cuatro y de tres— y una de cada veinte de las demás; las
    // otras coincidencias quedan libres y son su propia unidad. Clientes de cada
    // vendedor: tres de vendedor1 y dos de vendedor2.
    await db.query(
      `with numeradas as (
         select t.id, t.seller_id,
                row_number() over (order by t.daily_number, t.weekly_number) as n,
                (right(t.daily_number, 3) = right($10::text, 3)
                 or right(t.weekly_number, 3) = right($10::text, 3)) as coincide
           from tickets t where t.raffle_id = $1
       ), vendidas as (
         select id, seller_id, n from numeradas
          where (coincide and n % 2 = 0) or (not coincide and n % 20 = 0)
       )
       update tickets t
          set client_id = case
                when v.seller_id = $2::uuid then (array[$3, $4, $5]::uuid[])[1 + v.n % 3]
                else (array[$6, $7]::uuid[])[1 + v.n % 2]
              end,
              inventory_status = 'assigned', sale_price = $8, sale_date = '2026-01-02', assigned_at = $9
         from vendidas v
        where t.id = v.id`,
      [
        rifa,
        ctx.ids.seller1,
        ctx.clients.ana.id,
        ctx.clients.beatriz.id,
        ctx.clients.carlos.id,
        ctx.clients.diego.id,
        (await db.query<{ id: string }>(`select id from clients where name = 'Elena Castro'`))
          .rows[0]!.id,
        PRECIO,
        VENDIDA,
        ganador,
      ],
    )
    const { resultId } = await sorteo('cundinamarca', fecha, ganador)

    const c = new PgClient({ connectionString: DB_URL })
    await c.connect()
    let ms = 0
    let llamadas: Array<{ funcname: string; calls: number }> = []
    try {
      await c.query('begin')
      await c.query(`set local track_functions = 'all'`)
      const inicio = performance.now()
      await c.query('select match_lottery_result($1)', [resultId])
      ms = performance.now() - inicio
      llamadas = (
        await c.query<{ funcname: string; calls: number }>(
          `select funcname, calls::int as calls from pg_stat_xact_user_functions order by calls desc`,
        )
      ).rows
      await c.query('commit')
    } finally {
      await c.end()
    }

    // Lo esperado, calculado con la regla pura sobre las 5.000 boletas.
    const { rows: todas } = await db.query<{
      id: string
      daily_number: string
      weekly_number: string
      client_id: string | null
    }>(`select id, daily_number, weekly_number, client_id from tickets where raffle_id = $1`, [
      rifa,
    ])
    expect(todas).toHaveLength(5000)
    const candidatas: PrizeCandidate[] = []
    for (const t of todas) {
      for (const [p, campo, cifras] of [
        [premios.diarioCuatro, 'daily_number', 'four'],
        [premios.semanalCuatro, 'weekly_number', 'four'],
        [premios.diarioTres, 'daily_number', 'last_three'],
        [premios.semanalTres, 'weekly_number', 'last_three'],
      ] as const) {
        const numero = campo === 'daily_number' ? t.daily_number : t.weekly_number
        if (!prizeNumberMatches(numero, ganador, cifras)) continue
        candidatas.push({
          prizeId: p.prizeId,
          versionId: p.versionId,
          numberField: campo,
          digits: cifras,
          ticketId: t.id,
          raffleId: rifa,
          clientId: t.client_id,
        })
      }
    }
    const esperados = resolvePrizeLinks(candidatas)
      .map((e) => par(e.ticketId, e.prizeId))
      .sort()
    const reales = pares(await enlacesDe(resultId))

    expect(esperados.length).toBeGreaterThan(100)
    expect(reales).toEqual(esperados)

    // Ninguna función se llama por boleta ni por enlace. Lo más que se admite es
    // TRES llamadas por premio que juega: las dos lecturas del motor —la defensa
    // de BR-J08 y la sentencia— y la comprobación canónica de la defensa. Con
    // más de cien enlaces, una llamada por fila saltaría a la vista.
    const presupuesto = 3 * Object.keys(premios).length
    const maximo = Math.max(...llamadas.map((l) => l.calls))
    const detalle = `${reales.length} enlaces, ${Math.round(ms)} ms, llamadas ${JSON.stringify(llamadas)}`
    expect(maximo, detalle).toBeLessThanOrEqual(presupuesto)
    expect(presupuesto, detalle).toBeLessThan(reales.length)
    expect(ms, detalle).toBeLessThan(5000)
  }, 180_000)
})

// =============================================================================
describe('M11 — el 21 de diciembre, completo (30)', () => {
  it('M11-01: el premio mayor con cuatro alternativas y el de $1.000.000 por tres cifras, con la prioridad por cliente', async () => {
    const rifa = await nuevaRifa('diciembre', '2082-12-01', '2082-12-31')
    const fecha = '2082-12-21'
    expect(isoWeekday(fecha)).toBe(1)
    const mayor = await premio(owner, rifa, {
      titulo: 'Premio mayor',
      categoria: 'main',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(fecha, 'cundinamarca')],
      modo: 'winner_choice',
      opciones: [
        { description: 'Camioneta KIA', amount: null },
        { description: 'Renault Alaskan 2023', amount: 20_000_000 },
        { description: null, amount: 120_000_000 },
        { description: 'Renault Logan Zen público 2023', amount: 70_000_000 },
      ],
    })
    const millon = await premio(owner, rifa, {
      titulo: 'Premio de tres cifras',
      categoria: 'special',
      campo: 'daily_number',
      cifras: 'last_three',
      reglas: [unDia(fecha)],
      opciones: [{ description: null, amount: 1_000_000 }],
    })
    // Otro premio del mes, en otra fecha: no juega el 21.
    const otroDia = await premio(owner, rifa, {
      titulo: 'Especial del 15',
      categoria: 'special',
      campo: 'weekly_number',
      cifras: 'four',
      reglas: [unDia('2082-12-15')],
    })
    await activar(rifa)

    const [ana4818, ana9818, carlos0818, diego818, beatrizSemanal, libre7818, corta] =
      await boletas(rifa, [
        { diario: '4818', semanal: '0001', cliente: ctx.clients.ana.id },
        { diario: '9818', semanal: '0002', cliente: ctx.clients.ana.id },
        { diario: '0818', semanal: '0003', cliente: ctx.clients.carlos.id },
        { diario: '818', semanal: '0004', vendedor: 'seller2', cliente: ctx.clients.diego.id },
        { diario: '1111', semanal: '4818', cliente: ctx.clients.beatriz.id },
        { diario: '7818', semanal: '0005' },
        { diario: '18', semanal: '0006' },
      ])
    const { drawNumber } = await programacion('cundinamarca', fecha)
    const { data, error } = await ctx.svc.rpc('confirm_lottery_result', {
      p_lottery_code: 'cundinamarca',
      p_draw_number: drawNumber,
      p_winning_number: '4818',
    })
    expect(error).toBeNull()
    const resultId = (data as unknown as { result_id: string }).result_id

    const filas = await enlacesDe(resultId)
    expect(pares(filas)).toEqual(
      [
        par(ana4818!, mayor.prizeId),
        par(carlos0818!, millon.prizeId),
        par(diego818!, millon.prizeId),
        par(libre7818!, millon.prizeId),
      ].sort(),
    )
    const idsConPremio = filas.map((f) => f.ticket_id)
    expect(idsConPremio).not.toContain(ana9818)
    expect(idsConPremio).not.toContain(beatrizSemanal)
    expect(idsConPremio).not.toContain(corta)
    expect(filas.map((f) => f.prize_id)).not.toContain(otroDia.prizeId)
    expect(filas.find((f) => f.ticket_id === ana4818)).toMatchObject({
      prize_version_id: mayor.versionId,
      assignment_status: 'sold',
      client_id: ctx.clients.ana.id,
    })
    expect(filas.find((f) => f.ticket_id === libre7818)!.assignment_status).toBe('available')

    // Un solo premio mayor con sus cuatro alternativas, intactas en su versión: el
    // enlace no dice cuál se eligió.
    const { rows: alternativas } = await db.query<{ reward_mode: string; n: number }>(
      `select v.reward_mode::text, (select count(*)::int from raffle_prize_reward_options o where o.version_id = v.id) as n
         from raffle_prize_versions v where v.id = $1`,
      [mayor.versionId],
    )
    expect(alternativas[0]).toEqual({ reward_mode: 'winner_choice', n: 4 })

    // Los avisos cuentan BOLETAS de cada vendedor y de la organización.
    const { rows: avisos } = await db.query<{
      recipient_profile_id: string
      data: Record<string, unknown>
    }>(
      `select recipient_profile_id, data from notifications where kind = 'lottery.result' and entity_id = $1`,
      [resultId],
    )
    expect(avisos.find((a) => a.recipient_profile_id === ctx.ids.seller1)!.data).toMatchObject({
      sold_count: 2,
      available_count: 1,
    })
    expect(avisos.find((a) => a.recipient_profile_id === ctx.ids.seller2)!.data).toMatchObject({
      sold_count: 1,
      available_count: 0,
    })
    expect(avisos.find((a) => a.recipient_profile_id === ctx.ids.owner)!.data).toMatchObject({
      audience: 'staff',
      sold_count: 3,
      available_count: 1,
    })
  })
})

// =============================================================================
describe('M12 — el corte efectivo: la menor entre la hora original y la oficial (I-125, D-203 Decisión 9)', () => {
  /**
   * Una rifa activa con un premio de cuatro cifras (versión 1) que después pasa a
   * tres cifras (versión 2). Devuelve el instante exacto de cada publicación:
   * los cortes de cada prueba se colocan antes, entre o justo en esos instantes.
   */
  async function premioQueCambia(nombre: string, dias: string[], desde: string, hasta: string) {
    const rifa = await nuevaRifa(nombre, desde, hasta)
    const base: PremioInput = {
      titulo: 'Cambia de cifras',
      campo: 'daily_number',
      cifras: 'four',
      reglas: dias.map((dia) => unDia(dia)),
    }
    const premioCreado = await premio(owner, rifa, base)
    await activar(rifa)
    const v1 = premioCreado.versionId
    const v2 = await publicar(premioCreado.prizeId, v1, { ...base, cifras: 'last_three' })
    return {
      rifa,
      base,
      prizeId: premioCreado.prizeId,
      v1,
      v2,
      t1: await publicadaEn(v1),
      t2: await publicadaEn(v2),
    }
  }

  /** Una fotografía y su enlace en UNA sentencia, escritos a mano. */
  const ENLACE_A_MANO = `
    with m as (
      insert into lottery_ticket_matches (result_id, ticket_id, organization_id, raffle_id, seller_id,
        client_id, match_field, matched_number, assignment_status, inventory_status_at_draw,
        assigned_at, ticket_created_at)
      select $1, t.id, t.organization_id, t.raffle_id, t.seller_id, null, 'daily_number',
             t.daily_number, 'available', 'available', null, t.created_at
        from tickets t where t.id = $2
      returning id, organization_id, raffle_id
    )
    insert into lottery_ticket_match_prizes (organization_id, raffle_id, result_id, match_id,
      match_field, prize_id, prize_version_id)
    select m.organization_id, m.raffle_id, $1, m.id, 'daily_number', $3, $4 from m`

  it('M12-01: sin cambio de programación, el corte es la hora común (1)', async () => {
    const { lunes, desde, hasta } = semanas()
    const e = await premioQueCambia('corte normal', [lunes], desde, hasta)
    const hora = await entre(e.t1, e.t2)
    const [exacta, sufijo] = await boletas(e.rifa, [
      { diario: '4040', semanal: '0001' },
      { diario: '9040', semanal: '0002' },
    ])
    const { scheduleId, resultId } = await sorteo('cundinamarca', lunes, '4040', {
      original: hora,
      oficial: hora,
    })

    expect(await mismoInstante(await corteDe(scheduleId), hora)).toBe(true)
    await buscarBien(resultId)
    const filas = await enlacesDe(resultId)
    expect(pares(filas)).toEqual([par(exacta!, e.prizeId)])
    expect(filas[0]!.prize_version_id).toBe(e.v1)
    expect(filas.map((f) => f.ticket_id)).not.toContain(sufijo)
  })

  it('M12-02: APLAZADO: aplica la versión anterior a la hora original y no la publicada entre la original y la oficial (2)', async () => {
    const { lunes, desde, hasta } = semanas()
    const fecha = diaDe(lunes, 'cruz_roja')
    const e = await premioQueCambia('corte aplazado', [fecha], desde, hasta)
    const original = await entre(e.t1, e.t2)
    const oficial = await desplazado(e.t2, '1 day')
    const [exacta, sufijo] = await boletas(e.rifa, [
      { diario: '5151', semanal: '0001' },
      { diario: '9151', semanal: '0002' },
    ])
    const { scheduleId, resultId } = await sorteo('cruz_roja', fecha, '5151', {
      original,
      oficial,
      estado: 'rescheduled_later',
    })

    expect(await mismoInstante(await corteDe(scheduleId), original)).toBe(true)
    await buscarBien(resultId)
    const filas = await enlacesDe(resultId)
    expect(pares(filas)).toEqual([par(exacta!, e.prizeId)])
    expect(filas[0]!.prize_version_id).toBe(e.v1)
    expect(filas.map((f) => f.ticket_id)).not.toContain(sufijo)
  })

  it('M12-03: ADELANTADO: aplica la versión anterior a la hora oficial y no la publicada entre la oficial y la original (3)', async () => {
    const { lunes, desde, hasta } = semanas()
    const fecha = diaDe(lunes, 'bogota')
    const e = await premioQueCambia('corte adelantado', [fecha], desde, hasta)
    const oficial = await entre(e.t1, e.t2)
    const original = await desplazado(e.t2, '1 day')
    const [exacta, sufijo] = await boletas(e.rifa, [
      { diario: '6161', semanal: '0001' },
      { diario: '9161', semanal: '0002' },
    ])
    const { scheduleId, resultId } = await sorteo('bogota', fecha, '6161', {
      original,
      oficial,
      estado: 'rescheduled_earlier',
    })

    expect(await mismoInstante(await corteDe(scheduleId), oficial)).toBe(true)
    await buscarBien(resultId)
    const filas = await enlacesDe(resultId)
    expect(pares(filas)).toEqual([par(exacta!, e.prizeId)])
    expect(filas[0]!.prize_version_id).toBe(e.v1)
    expect(filas.map((f) => f.ticket_id)).not.toContain(sufijo)
  })

  it('M12-04: I-125, regresión: un sorteo adelantado que ya se jugó no toma el cambio publicado después (10)', async () => {
    // Lo reproducido el 2026-09-16: Bogotá adelantada, versión 1 de cuatro cifras, y
    // una versión 2 de tres cifras publicada DESPUÉS de jugarse y antes de su hora
    // original. Con la `0061` el motor enlazaba la versión 2 a las dos boletas.
    const { lunes, desde, hasta } = semanas()
    const fecha = diaDe(lunes, 'bogota')
    const rifa = await nuevaRifa('I-125', desde, hasta)
    const base: PremioInput = {
      titulo: 'Adelantado',
      campo: 'daily_number',
      cifras: 'four',
      reglas: [unDia(fecha)],
    }
    const creado = await premio(owner, rifa, base)
    await activar(rifa)
    const [cuatro, tres] = await boletas(rifa, [
      { diario: '9876', semanal: '0001' },
      { diario: '1876', semanal: '0002' },
    ])

    // Se juega AHORA, adelantado: su hora original era al día siguiente.
    const { rows: reloj } = await db.query<{ t: string }>(`select clock_timestamp()::text as t`)
    const jugado = reloj[0]!.t
    const original = await desplazado(jugado, '1 day')
    const { drawNumber, scheduleId } = await programacion('bogota', fecha, {
      original,
      oficial: jugado,
      estado: 'rescheduled_earlier',
    })

    // Después de jugarse, el premio pasa a tres cifras.
    const v2 = await publicar(creado.prizeId, creado.versionId, { ...base, cifras: 'last_three' })
    const { rows: orden } = await db.query<{ despues: boolean; antes_original: boolean }>(
      `select $1::timestamptz > $2::timestamptz as despues, $1::timestamptz < $3::timestamptz as antes_original`,
      [await publicadaEn(v2), jugado, original],
    )
    expect(orden[0]).toEqual({ despues: true, antes_original: true })

    const { data, error } = await ctx.svc.rpc('confirm_lottery_result', {
      p_lottery_code: 'bogota',
      p_draw_number: drawNumber,
      p_winning_number: '9876',
    })
    expect(error).toBeNull()
    const resultId = (data as unknown as { result_id: string }).result_id

    expect(await mismoInstante(await corteDe(scheduleId), jugado)).toBe(true)
    const filas = await enlacesDe(resultId)
    expect(pares(filas)).toEqual([par(cuatro!, creado.prizeId)])
    expect(filas[0]!.prize_version_id).toBe(creado.versionId)
    expect(filas.map((f) => f.ticket_id)).not.toContain(tres)
  })

  it('M12-05: una versión publicada EXACTAMENTE en el corte efectivo no aplica, sin cambio y adelantado (4)', async () => {
    const { lunes, desde, hasta } = semanas(2)
    const normal = lunes
    const adelantado = addDays(lunes, 7)
    const e = await premioQueCambia('corte exacto', [normal, adelantado], desde, hasta)
    const [exacta, sufijo] = await boletas(e.rifa, [
      { diario: '7171', semanal: '0001' },
      { diario: '9171', semanal: '0002' },
    ])

    const sinCambio = await sorteo('cundinamarca', normal, '7171', {
      original: e.t2,
      oficial: e.t2,
    })
    const conAdelanto = await sorteo('cundinamarca', adelantado, '7171', {
      original: await desplazado(e.t2, '1 day'),
      oficial: e.t2,
      estado: 'rescheduled_earlier',
    })

    for (const { scheduleId, resultId } of [sinCambio, conAdelanto]) {
      expect(await mismoInstante(await corteDe(scheduleId), e.t2)).toBe(true)
      await buscarBien(resultId)
      const filas = await enlacesDe(resultId)
      expect(pares(filas)).toEqual([par(exacta!, e.prizeId)])
      expect(filas[0]!.prize_version_id).toBe(e.v1)
      expect(filas.map((f) => f.ticket_id)).not.toContain(sufijo)
    }
  })

  it('M12-06: después de buscar, ni otra versión ni un cambio de programación alteran los enlaces, y reintentar tampoco (5, 6)', async () => {
    const { lunes, desde, hasta } = semanas()
    const fecha = diaDe(lunes, 'meta')
    const e = await premioQueCambia('corte despues', [fecha], desde, hasta)
    const oficial = await entre(e.t1, e.t2)
    const original = await desplazado(e.t2, '1 day')
    const [exacta] = await boletas(e.rifa, [
      { diario: '8181', semanal: '0001' },
      { diario: '9181', semanal: '0002' },
    ])
    const { scheduleId, resultId } = await sorteo('meta', fecha, '8181', {
      original,
      oficial,
      estado: 'rescheduled_earlier',
    })
    await buscarBien(resultId)
    const antes = await enlacesDe(resultId)
    expect(pares(antes)).toEqual([par(exacta!, e.prizeId)])
    expect(antes[0]!.prize_version_id).toBe(e.v1)

    // Una versión 3 después del sorteo…
    await publicar(e.prizeId, e.v2, { ...e.base, cifras: 'four' })
    // …y la programación corregida a mano: la hora oficial, antes incluso de la versión 1.
    await db.query(
      `update lottery_draw_schedules
          set official_scheduled_at = $2::timestamptz - interval '1 day'
        where id = $1`,
      [scheduleId, e.t1],
    )
    expect(await enlacesDe(resultId)).toEqual(antes)

    expect(await buscarBien(resultId)).toMatchObject({ inserted: 0, prize_links: 0 })
    const despues = await enlacesDe(resultId)
    expect(despues).toEqual(antes)
    expect(despues[0]!.prize_version_id).toBe(e.v1)
  })

  it('M12-07: la defensa rechaza un enlace escrito con una versión posterior al corte efectivo (7)', async () => {
    const { lunes, desde, hasta } = semanas()
    const fecha = diaDe(lunes, 'medellin')
    const e = await premioQueCambia('corte defensa', [fecha], desde, hasta)
    const oficial = await entre(e.t1, e.t2)
    const original = await desplazado(e.t2, '1 day')
    const [, sufijo] = await boletas(e.rifa, [
      { diario: '3131', semanal: '0001' },
      { diario: '9131', semanal: '0002' },
    ])
    const { resultId } = await sorteo('medellin', fecha, '3131', {
      original,
      oficial,
      estado: 'rescheduled_earlier',
    })
    await buscarBien(resultId)

    // Con la hora ORIGINAL como corte, la versión 2 sería la aplicable: por eso la
    // defensa de la `0061` habría dejado pasar este enlace.
    const { rows } = await db.query<{ con_original: string }>(
      `select raffle_prize_applicable_version($1, $2::timestamptz) as con_original`,
      [e.prizeId, original],
    )
    expect(rows[0]!.con_original).toBe(e.v2)

    await expect(db.query(ENLACE_A_MANO, [resultId, sufijo, e.prizeId, e.v2])).rejects.toThrow(
      /no es el que aplica a este sorteo/,
    )
    expect((await enlacesDe(resultId)).map((f) => f.ticket_id)).not.toContain(sufijo)
  })

  it('M12-08: la rama legacy no cambia: la venta la decide la hora oficial, sin enlaces, y no necesita la hora original (8)', async () => {
    const { lunes, desde, hasta } = semanas(2)
    const fecha = diaDe(lunes, 'cruz_roja')
    const heredada = await nuevaRifa('corte heredada', desde, hasta, { modo: 'legacy' })
    await activar(heredada)
    const oficial = horaDe(fecha)
    const original = horaDe(addDays(fecha, 2))
    const [vendidaAntes, vendidaEntreHoras] = await boletas(heredada, [
      { diario: '2323', semanal: '0001', cliente: ctx.clients.ana.id },
      {
        diario: '2323',
        semanal: '0002',
        cliente: ctx.clients.carlos.id,
        vendidaEn: horaDe(addDays(fecha, 1)),
      },
    ])

    const adelantado = await sorteo('cruz_roja', fecha, '2323', {
      original,
      oficial,
      estado: 'rescheduled_earlier',
    })
    await buscarBien(adelantado.resultId)
    const filas = await enlacesDe(adelantado.resultId)
    expect(filas.find((f) => f.ticket_id === vendidaAntes)).toMatchObject({
      assignment_status: 'sold',
      client_id: ctx.clients.ana.id,
      prize_id: null,
    })
    expect(filas.find((f) => f.ticket_id === vendidaEntreHoras)).toMatchObject({
      assignment_status: 'late_assignment',
      client_id: null,
      prize_id: null,
    })

    // Sin hora original: la rama heredada nunca la necesitó y sigue igual.
    const sinOriginal = await sorteo('cruz_roja', addDays(fecha, 7), '2323', { original: null })
    const salida = await buscarBien(sinOriginal.resultId)
    expect(salida).toMatchObject({ inserted: 2, prize_links: 0 })
  })

  it('M12-09: si no se puede calcular el corte no queda nada escrito: ni resultado, ni fotografías heredadas, ni enlaces (9)', async () => {
    const { lunes, desde, hasta } = semanas()
    const fecha = diaDe(lunes, 'boyaca')
    const heredada = await nuevaRifa('sin corte heredada 2', desde, hasta, { modo: 'legacy' })
    await activar(heredada)
    const configurable = await nuevaRifa('sin corte configurable 2', desde, hasta)
    await premio(owner, configurable, {
      titulo: 'Semanal',
      categoria: 'weekly',
      campo: 'weekly_number',
      cifras: 'four',
      reglas: [unDia(fecha)],
    })
    await activar(configurable)
    await boletas(heredada, [{ diario: '0001', semanal: '4545' }])
    await boletas(configurable, [{ diario: '0001', semanal: '4545' }])
    const { drawNumber, scheduleId } = await programacion('boyaca', fecha, { original: null })
    expect(await corteDe(scheduleId)).toBeNull()

    const { error } = await ctx.svc.rpc('confirm_lottery_result', {
      p_lottery_code: 'boyaca',
      p_draw_number: drawNumber,
      p_winning_number: '4545',
    })
    expect(error?.code).toBe('22000')
    expect(
      await contar(`select count(*)::int as n from lottery_results where schedule_id = $1`, [
        scheduleId,
      ]),
    ).toBe(0)
    expect(
      await contar(
        `select count(*)::int as n from lottery_ticket_matches where raffle_id = any ($1::uuid[])`,
        [[heredada, configurable]],
      ),
    ).toBe(0)
  })

  it('M12-10: la definición canónica dice lo mismo que `prizeDrawCutoff`, también sin hora oficial o sin programación', async () => {
    const { lunes } = semanas()
    const casos: Array<{
      loteria: Loteria
      original: string | null
      oficial: string | null
      estado: SorteoOpciones['estado']
    }> = [
      {
        loteria: 'cundinamarca',
        original: horaDe(lunes),
        oficial: horaDe(lunes),
        estado: 'scheduled',
      },
      {
        loteria: 'cruz_roja',
        original: horaDe(diaDe(lunes, 'cruz_roja')),
        oficial: horaDe(diaDe(lunes, 'bogota')),
        estado: 'rescheduled_later',
      },
      {
        loteria: 'meta',
        original: horaDe(diaDe(lunes, 'meta')),
        oficial: horaDe(lunes),
        estado: 'rescheduled_earlier',
      },
      {
        loteria: 'bogota',
        original: horaDe(diaDe(lunes, 'bogota')),
        oficial: null,
        estado: 'schedule_unverified',
      },
      {
        loteria: 'medellin',
        original: null,
        oficial: horaDe(diaDe(lunes, 'medellin')),
        estado: 'scheduled',
      },
    ]
    for (const caso of casos) {
      const { scheduleId } = await programacion(caso.loteria, diaDe(lunes, caso.loteria), {
        original: caso.original,
        oficial: caso.oficial,
        estado: caso.estado,
      })
      const enLaBase = await corteDe(scheduleId)
      const enTypeScript = prizeDrawCutoff({
        originalScheduledAt: caso.original,
        officialScheduledAt: caso.oficial,
      })
      expect(await mismoInstante(enLaBase, enTypeScript), `${caso.loteria} ${caso.estado}`).toBe(
        true,
      )
    }

    // Una programación que no existe llega como una fila nula: tampoco hay corte.
    const { rows } = await db.query<{ t: string | null }>(
      `select raffle_prize_draw_cutoff(null::lottery_draw_schedules)::text as t`,
    )
    expect(rows[0]!.t).toBeNull()
  })
})
