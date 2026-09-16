/**
 * La transición de una rifa existente a premios configurables — Entrega 4
 * (D-204, migración `0063`; BR-J09, BR-J11, BR-J12, BR-J13).
 *
 * LO QUE SE PRUEBA AQUÍ ES LO QUE SOLO LA BASE PUEDE GARANTIZAR: quién puede
 * hacer la transición, que se hace entera o no se hace, que no toca ni una fila
 * de la cartera ni de los resultados, que un segundo intento no duplica nada,
 * que se niega mientras quede un sorteo jugado sin confirmar, y que después el
 * motor encuentra las coincidencias con los seis premios confirmados.
 *
 * DATOS AISLADOS, y sin caducidad:
 *
 *   * La RIFA EQUIVALENTE a la real vive en 2065, que tiene EXACTAMENTE el
 *     calendario de 2026 (39 años son 2.035 semanas justas): el 21 de diciembre
 *     de 2065 también es lunes. La configuración es `confirmedRafflePrizes`, la
 *     misma que usará la Entrega 5, trasladada de año. Así la prueba no deja de
 *     pasar cuando lleguen las fechas reales, y el motor —que es nacional— no se
 *     cruza con ninguna otra suite.
 *   * Los sorteos YA JUGADOS viven en 2018, con sus horas de verdad en el
 *     pasado, un día por escenario.
 *
 * La transición la ejecuta la service role, que es la única que puede. Las
 * sesiones reales del Dueño, del Administrador y de los vendedores comprueban lo
 * que NO pueden hacer y lo que leen después. PostgreSQL directo prepara boletas,
 * sorteos y resultados, y limpia al final con `session_replication_role =
 * replica`, porque premios, versiones, transiciones y fotografías son inmutables
 * también para la service role.
 */
import { randomUUID } from 'node:crypto'

import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LOTTERY_LABELS } from '@/features/lottery/constants'
import { prizeActorLabel } from '@/features/raffle-prizes/copy'
import {
  confirmedPrizeStarts,
  confirmedRafflePrizes,
  type TransitionPrizePayload,
  type TransitionResult,
} from '@/features/raffle-prizes/transition'
import type { Json } from '@/types/database.types'

import {
  anonClient,
  DB_URL,
  loadSeedContext,
  SEED_PASSWORD,
  serviceClient,
  signInAs,
  USERS,
  type Client,
} from './helpers'

type Loteria = 'cundinamarca' | 'cruz_roja' | 'meta' | 'bogota' | 'medellin' | 'boyaca'
type EstadoRifa = 'draft' | 'active' | 'closed' | 'cancelled'

type Rifa = {
  id: string
  organization_id: string
  name: string
  status: EstadoRifa
  start_date: string
  end_date: string
}

const PREFIJO = 'E4 transición'
const SORTEO = 'E4-'
const stamp = Date.now().toString(36)
/** 2026 → 2065: el mismo calendario, día por día. */
const DESPLAZAMIENTO = 39

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let db: PgClient
let owner: Client
let admin: Client
let seller1: Client
let otherOrgOwner: Client
let anon: Client
let svc: Client
let secuencia = 0
const perfilesCreados: string[] = []

// -----------------------------------------------------------------------------
// Fechas y configuración
// -----------------------------------------------------------------------------

function trasladar(fecha: string, anos = DESPLAZAMIENTO): string {
  return `${Number(fecha.slice(0, 4)) + anos}${fecha.slice(4)}`
}

function trasladarPremios(premios: TransitionPrizePayload[]): TransitionPrizePayload[] {
  return premios.map((premio) => ({
    ...premio,
    rules: premio.rules.map((regla) => ({
      ...regla,
      start_date: trasladar(regla.start_date),
      end_date: trasladar(regla.end_date),
    })),
  }))
}

/**
 * Los seis premios confirmados, como quedarían con la transición el martes 1 de
 * septiembre: el diario desde ese día y el de fin de semana desde el sábado 5.
 * Trasladados a 2065.
 */
function configuracionReal(): TransitionPrizePayload[] {
  const inicio = confirmedPrizeStarts({
    draws: [],
    now: new Date('2026-09-01T08:00:00-05:00'),
    raffleStartDate: '2026-08-03',
  })
  return trasladarPremios(confirmedRafflePrizes(inicio))
}

/** Un premio suelto de un día, para los escenarios que no son la rifa real. */
function premioDeUnDia(
  fecha: string,
  extra: Partial<TransitionPrizePayload> = {},
): TransitionPrizePayload {
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay()
  return {
    title: 'Premio de un día',
    category: 'daily',
    reward_mode: 'fixed',
    reward_options: [{ description: null, amount: 500_000 }],
    number_field: 'daily_number',
    digits: 'four',
    rules: [
      {
        start_date: fecha,
        end_date: fecha,
        weekdays: [dia === 0 ? 7 : dia],
        lottery_mode: 'corresponding',
        lottery_code: null,
      },
    ],
    conditions: null,
    ...extra,
  }
}

// -----------------------------------------------------------------------------
// Escenario
// -----------------------------------------------------------------------------

async function nuevaRifa(
  nombre: string,
  desde: string,
  hasta: string,
  opciones: { estado?: EstadoRifa; modo?: 'legacy' | 'configurable' } = {},
): Promise<Rifa> {
  const { rows } = await db.query<{ id: string }>(
    `insert into raffles (organization_id, name, ticket_price, start_date, end_date, created_by, prize_mode)
     values ($1, $2, 120000, $3, $4, $5, $6)
     returning id`,
    [
      ctx.demoOrg.id,
      `${PREFIJO} ${nombre} ${stamp}`,
      desde,
      hasta,
      ctx.ids.owner,
      opciones.modo ?? 'legacy',
    ],
  )
  const id = rows[0]!.id
  const estado = opciones.estado ?? 'active'
  if (estado !== 'draft') {
    await db.query(`update raffles set status = 'active' where id = $1`, [id])
    if (estado !== 'active') {
      await db.query(`update raffles set status = $2 where id = $1`, [id, estado])
    }
  }
  return rifa(id)
}

async function rifa(id: string): Promise<Rifa> {
  const { rows } = await db.query<Rifa>(
    `select id, organization_id, name, status::text as status,
            start_date::text as start_date, end_date::text as end_date
       from raffles where id = $1`,
    [id],
  )
  return rows[0]!
}

type Expectativas = {
  apply?: boolean
  org?: string
  raffleId?: string
  name?: string
  status?: EstadoRifa
  start?: string
  end?: string
}

function transicion(
  cliente: Client,
  r: Rifa,
  premios: TransitionPrizePayload[],
  e: Expectativas = {},
) {
  return cliente.rpc('transition_raffle_prize_mode', {
    p_organization_id: e.org ?? r.organization_id,
    p_raffle_id: e.raffleId ?? r.id,
    p_expected_name: e.name ?? r.name,
    p_expected_status: e.status ?? r.status,
    p_expected_start_date: e.start ?? r.start_date,
    p_expected_end_date: e.end ?? r.end_date,
    p_prizes: premios as unknown as Json,
    p_apply: e.apply ?? false,
  })
}

async function aplicar(r: Rifa, premios: TransitionPrizePayload[]): Promise<TransitionResult> {
  const { data, error } = await transicion(svc, r, premios, { apply: true })
  if (error) throw new Error(`La transición falló: ${error.message}`)
  return data as unknown as TransitionResult
}

type Estado = {
  modo: string
  estado: string
  desde: string
  hasta: string
  premios: number
  versiones: number
  periodos: number
  alternativas: number
  transiciones: number
  avisos: number
  bitacora: number
  cambios_de_modo: number
  bitacora_de_premios: number
}

async function estado(raffleId: string): Promise<Estado> {
  const { rows } = await db.query<Estado>(
    `select r.prize_mode::text as modo, r.status::text as estado,
            r.start_date::text as desde, r.end_date::text as hasta,
            (select count(*)::int from raffle_prizes p where p.raffle_id = r.id) as premios,
            (select count(*)::int from raffle_prize_versions v where v.raffle_id = r.id) as versiones,
            (select count(*)::int from raffle_prize_schedule_rules s
               join raffle_prize_versions v on v.id = s.version_id where v.raffle_id = r.id) as periodos,
            (select count(*)::int from raffle_prize_reward_options o
               join raffle_prize_versions v on v.id = o.version_id where v.raffle_id = r.id) as alternativas,
            (select count(*)::int from raffle_prize_transitions t where t.raffle_id = r.id) as transiciones,
            (select count(*)::int from notifications n
              where n.kind = 'raffle_prize.changed' and (n.data ->> 'raffle_id')::uuid = r.id) as avisos,
            (select count(*)::int from audit_logs a
              where a.entity_id = r.id and a.action = 'raffle.prize_mode_transition') as bitacora,
            (select count(*)::int from audit_logs a
              where a.entity_id = r.id and a.action = 'raffle.update' and a.new_values ? 'prize_mode') as cambios_de_modo,
            (select count(*)::int from audit_logs a
              where a.entity_type = 'raffle_prize'
                and (coalesce(a.new_values, a.old_values) ->> 'raffle_id')::uuid = r.id) as bitacora_de_premios
       from raffles r where r.id = $1`,
    [raffleId],
  )
  return rows[0]!
}

/** Lo que una rifa heredada tiene ANTES de la transición: nada de premios. */
function sinTransicion(e: Estado) {
  expect(e).toMatchObject({
    modo: 'legacy',
    premios: 0,
    versiones: 0,
    periodos: 0,
    alternativas: 0,
    transiciones: 0,
    avisos: 0,
    bitacora: 0,
    cambios_de_modo: 0,
    bitacora_de_premios: 0,
  })
}

type Huella = Record<string, string | number>

/**
 * La cartera y los resultados, contados en toda la base y resumidos con una
 * huella fila por fila en la rifa: boletas, clientes, pagos, asignaciones,
 * fotografías, enlaces, resultados y membresías.
 */
async function huella(raffleId: string): Promise<Huella> {
  const { rows } = await db.query<Huella>(
    `select
       (select count(*)::int from tickets) as boletas,
       (select count(*)::int from clients) as clientes,
       (select count(*)::int from payments) as pagos,
       (select count(*)::int from payment_allocations) as asignaciones,
       (select count(*)::int from lottery_ticket_matches) as fotografias,
       (select count(*)::int from lottery_ticket_match_prizes) as enlaces,
       (select count(*)::int from lottery_results) as resultados,
       (select count(*)::int from memberships) as membresias,
       (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from tickets t
         where t.raffle_id = $1) as huella_boletas,
       (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from clients c
         where c.id in (select client_id from tickets where raffle_id = $1)) as huella_clientes,
       (select md5(coalesce(string_agg(a::text, '|' order by a.id), '')) from payment_allocations a
         where a.ticket_id in (select id from tickets where raffle_id = $1)) as huella_asignaciones,
       (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from payments p
         where p.id in (select a.payment_id from payment_allocations a
                         where a.ticket_id in (select id from tickets where raffle_id = $1))) as huella_pagos,
       (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from lottery_ticket_matches m
         where m.raffle_id = $1) as huella_fotografias,
       (select md5(coalesce(string_agg(r::text, '|' order by r.id), '')) from lottery_results r
         where r.id in (select result_id from lottery_ticket_matches where raffle_id = $1)) as huella_resultados,
       (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from memberships m
         where m.organization_id = $2) as huella_membresias`,
    [raffleId, ctx.demoOrg.id],
  )
  return rows[0]!
}

async function programacion(
  loteria: Loteria,
  fecha: string,
  opciones: { original?: string | null; oficial?: string | null; estado?: string } = {},
): Promise<{ scheduleId: string; drawNumber: string }> {
  secuencia += 1
  const drawNumber = `${SORTEO}${stamp}-${secuencia}`
  const oficial = opciones.oficial === undefined ? `${fecha}T22:30:00-05:00` : opciones.oficial
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

/** Un resultado guardado sin buscar coincidencias: solo para lo que mira la transición. */
async function resultado(
  scheduleId: string,
  numero: string,
  validacion: 'confirmed' | 'pending' | 'conflict' = 'confirmed',
) {
  await db.query(
    `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
     values ($1, $2, $3::text::lottery_result_validation_status, 'official_page',
             case when $3::text = 'confirmed' then now() end)`,
    [scheduleId, numero, validacion],
  )
}

/** Confirma un resultado por el camino de producción: busca coincidencias y avisa. */
async function confirmar(loteria: Loteria, drawNumber: string, numero: string) {
  const { rows } = await db.query<{ r: { result_id: string } }>(
    `select confirm_lottery_result($1::lottery_code, $2, $3) as r`,
    [loteria, drawNumber, numero],
  )
  return rows[0]!.r.result_id
}

type BoletaInput = { diario: string; semanal: string; cliente?: string }

async function boletas(raffleId: string, filas: BoletaInput[]): Promise<string[]> {
  const ids: string[] = []
  for (const fila of filas) {
    const { rows } = await db.query<{ id: string }>(
      `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number,
                            weekly_number, inventory_status, created_at)
       values ($1, $2, $3, $4, $5, $6, 'available', '2026-01-01T08:00:00-05:00')
       returning id`,
      [ctx.demoOrg.id, raffleId, ctx.ids.seller1, ctx.ids.owner, fila.diario, fila.semanal],
    )
    const id = rows[0]!.id
    if (fila.cliente) {
      await db.query(
        `update tickets
            set client_id = $2, inventory_status = 'assigned', sale_price = 120000,
                sale_date = '2026-01-02', assigned_at = '2026-01-02T08:00:00-05:00'
          where id = $1`,
        [id, fila.cliente],
      )
    }
    ids.push(id)
  }
  return ids
}

async function limpiar(): Promise<void> {
  await db.query('begin')
  try {
    await db.query(`set local session_replication_role = replica`)
    const { rows: rifas } = await db.query<{ id: string }>(
      `select id from raffles where name like $1`,
      [`${PREFIJO} %`],
    )
    const { rows: sorteos } = await db.query<{ id: string }>(
      `select id from lottery_draw_schedules where draw_number like $1`,
      [`${SORTEO}%`],
    )
    const rifaIds = rifas.map((r) => r.id)
    const sorteoIds = sorteos.map((s) => s.id)
    const { rows: pagos } = await db.query<{ id: string }>(
      `select distinct payment_id as id from payment_allocations
        where ticket_id in (select id from tickets where raffle_id = any ($1::uuid[]))`,
      [rifaIds],
    )
    const pagoIds = pagos.map((p) => p.id)

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
           or entity_id in (select id from raffle_prize_transitions where raffle_id = any ($1::uuid[]))
           or entity_id = any ($3::uuid[])
           or (kind = 'raffle_prize.changed' and (data ->> 'raffle_id')::uuid = any ($1::uuid[]))`,
      [rifaIds, sorteoIds, pagoIds],
    )
    await db.query(`delete from lottery_results where schedule_id = any ($1::uuid[])`, [sorteoIds])
    await db.query(`delete from lottery_draw_schedules where id = any ($1::uuid[])`, [sorteoIds])
    await db.query(
      `delete from audit_logs
        where entity_id in (select id from tickets where raffle_id = any ($1::uuid[]))
           or entity_id = any ($1::uuid[])
           or entity_id = any ($2::uuid[])
           or (entity_type = 'raffle_prize'
               and (coalesce(new_values, old_values) ->> 'raffle_id')::uuid = any ($1::uuid[]))`,
      [rifaIds, pagoIds],
    )
    await db.query(`delete from commission_ledger where raffle_id = any ($1::uuid[])`, [rifaIds])
    await db.query(`delete from seller_commissions where raffle_id = any ($1::uuid[])`, [rifaIds])
    await db.query(
      `delete from payment_allocations where ticket_id in (select id from tickets where raffle_id = any ($1::uuid[]))`,
      [rifaIds],
    )
    await db.query(`delete from payments where id = any ($1::uuid[])`, [pagoIds])
    await db.query(`delete from tickets where raffle_id = any ($1::uuid[])`, [rifaIds])
    await db.query(`delete from raffle_prize_transitions where raffle_id = any ($1::uuid[])`, [
      rifaIds,
    ])
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

  svc = serviceClient()
  anon = anonClient()
  ;[owner, admin, seller1, otherOrgOwner] = await Promise.all([
    signInAs(USERS.owner),
    signInAs(USERS.admin),
    signInAs(USERS.seller1),
    signInAs(USERS.otherOrgOwner),
  ])
}, 60_000)

afterAll(async () => {
  await limpiar()
  for (const perfil of perfilesCreados) {
    await db.query('begin')
    await db.query(`set local session_replication_role = replica`)
    await db.query(`delete from notifications where recipient_profile_id = $1`, [perfil])
    await db.query(`delete from memberships where profile_id = $1`, [perfil])
    await db.query('commit')
    await ctx.svc.auth.admin.deleteUser(perfil)
  }
  await Promise.all([owner, admin, seller1, otherOrgOwner].map((c) => c?.auth.signOut()))
  await db.end()
}, 60_000)

// =============================================================================
describe('T1 — solo la operación interna cambia el modo, y su puerta es estrecha (BR-J13, D-204)', () => {
  let heredada: Rifa

  beforeAll(async () => {
    heredada = await nuevaRifa('puerta', '2065-01-05', '2065-02-28')
  })

  it('T1-01: ni el Dueño, ni el Administrador, ni un vendedor, ni otra organización, ni un visitante ejecutan la transición', async () => {
    for (const cliente of [owner, admin, seller1, otherOrgOwner, anon]) {
      const { data, error } = await transicion(cliente, heredada, configuracionReal(), {
        apply: true,
      })
      expect(error).not.toBeNull()
      expect(data).toBeNull()
    }
    sinTransicion(await estado(heredada.id))
  })

  it('T1-02: ninguna sesión cambia el modo con un UPDATE directo', async () => {
    for (const cliente of [owner, admin]) {
      const { error } = await cliente
        .from('raffles')
        .update({ prize_mode: 'configurable' } as never)
        .eq('id', heredada.id)
      expect(error?.message).toContain('no se cambia desde la aplicación')
    }
    for (const cliente of [seller1, otherOrgOwner, anon]) {
      await cliente
        .from('raffles')
        .update({ prize_mode: 'configurable' } as never)
        .eq('id', heredada.id)
    }
    sinTransicion(await estado(heredada.id))
  })

  it('T1-03: la service role tampoco cambia el modo de una rifa activa con un UPDATE suelto', async () => {
    const { error } = await svc
      .from('raffles')
      .update({ prize_mode: 'configurable' } as never)
      .eq('id', heredada.id)
    expect(error?.message).toContain('solo se puede cambiar mientras está en borrador')
    sinTransicion(await estado(heredada.id))
  })

  it('T1-04: nadie fuera de la migración lee ni escribe la tabla de transiciones', async () => {
    const insertar = await svc.from('raffle_prize_transitions').insert({
      organization_id: heredada.organization_id,
      raffle_id: heredada.id,
      raffle_status: 'active',
      raffle_start_date: heredada.start_date,
      raffle_end_date: heredada.end_date,
      configuration_hash: 'a'.repeat(64),
      prize_ids: ['11111111-2222-4333-8444-555555555555'],
    })
    expect(insertar.error).not.toBeNull()

    for (const cliente of [svc, owner, admin, seller1]) {
      const { error } = await cliente.from('raffle_prize_transitions').select('id')
      expect(error).not.toBeNull()
    }
  })

  it('T1-04b: la tabla de transiciones tiene RLS forzada, ninguna política y ningún privilegio', async () => {
    const { rows } = await db.query<{
      activa: boolean
      forzada: boolean
      politicas: number
      privilegios: number
    }>(
      `select c.relrowsecurity as activa, c.relforcerowsecurity as forzada,
              (select count(*)::int from pg_policies p
                where p.schemaname = 'public' and p.tablename = 'raffle_prize_transitions') as politicas,
              (select count(*)::int from information_schema.role_table_grants g
                where g.table_schema = 'public' and g.table_name = 'raffle_prize_transitions'
                  and g.grantee in ('public', 'anon', 'authenticated', 'service_role')) as privilegios
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'raffle_prize_transitions'`,
    )
    expect(rows[0]).toEqual({ activa: true, forzada: true, politicas: 0, privilegios: 0 })

    const { rows: operacion } = await db.query<{
      servicio: boolean
      sesion: boolean
      anonimo: boolean
    }>(
      `select has_function_privilege('service_role', p.oid, 'EXECUTE') as servicio,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as sesion,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anonimo
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'transition_raffle_prize_mode'`,
    )
    expect(operacion).toEqual([{ servicio: true, sesion: false, anonimo: false }])
  })

  it('T1-05: las piezas internas no se ejecutan desde ninguna sesión ni con la service role', async () => {
    for (const cliente of [svc, owner, seller1, anon]) {
      const apply = await cliente.rpc('raffle_prize_transition_apply', {
        p_organization_id: heredada.organization_id,
        p_raffle_id: heredada.id,
        p_expected_name: heredada.name,
        p_expected_status: 'active',
        p_expected_start_date: heredada.start_date,
        p_expected_end_date: heredada.end_date,
        p_prizes: configuracionReal() as unknown as Json,
      })
      expect(apply.error).not.toBeNull()

      const puerta = await cliente.rpc('raffle_prize_transition_open', { p_raffle_id: heredada.id })
      expect(puerta.error).not.toBeNull()
    }
    sinTransicion(await estado(heredada.id))
  })

  it('T1-06: una fila de transición escrita en OTRA transacción no abre la puerta, y el estado parcial se rechaza', async () => {
    const otra = await nuevaRifa('puerta cerrada', '2065-01-05', '2065-02-28')
    // A mano, como superusuario: es el único que puede escribirla fuera de la migración.
    await db.query(
      `insert into raffle_prize_transitions (organization_id, raffle_id, raffle_status,
         raffle_start_date, raffle_end_date, configuration_hash, prize_ids)
       values ($1, $2, 'active', $3, $4, $5, array[gen_random_uuid()])`,
      [otra.organization_id, otra.id, otra.start_date, otra.end_date, 'b'.repeat(64)],
    )

    await expect(
      db.query(`update raffles set prize_mode = 'configurable' where id = $1`, [otra.id]),
    ).rejects.toThrow(/solo se puede cambiar mientras está en borrador/)

    // Con la configuración real, cuyas fechas ni siquiera caben en esta rifa: el
    // estado parcial se dice ANTES que cualquier problema de la configuración.
    const { error } = await transicion(svc, otra, configuracionReal(), { apply: true })
    expect(error?.message).toContain(
      'tiene una transición registrada, pero sigue con el sistema de premios de siempre',
    )
    expect((await estado(otra.id)).premios).toBe(0)
  })

  it('T1-07: por la puerta no se cambia a la vez el estado ni las fechas, ni se pasa sin premios', async () => {
    const puerta = await nuevaRifa('puerta con estado', '2065-01-05', '2065-02-28')
    const abrir = async () =>
      db.query(
        `insert into raffle_prize_transitions (organization_id, raffle_id, raffle_status,
           raffle_start_date, raffle_end_date, configuration_hash, prize_ids)
         values ($1, $2, 'active', $3, $4, $5, array[gen_random_uuid()])`,
        [puerta.organization_id, puerta.id, puerta.start_date, puerta.end_date, 'c'.repeat(64)],
      )

    await db.query('begin')
    await abrir()
    await expect(
      db.query(`update raffles set prize_mode = 'configurable', status = 'closed' where id = $1`, [
        puerta.id,
      ]),
    ).rejects.toThrow(/no cambia el estado ni las fechas/)
    await db.query('rollback')

    await db.query('begin')
    await abrir()
    await expect(
      db.query(
        `update raffles set prize_mode = 'configurable', end_date = '2065-03-31' where id = $1`,
        [puerta.id],
      ),
    ).rejects.toThrow(/no cambia el estado ni las fechas/)
    await db.query('rollback')

    await db.query('begin')
    await abrir()
    await expect(
      db.query(`update raffles set prize_mode = 'configurable' where id = $1`, [puerta.id]),
    ).rejects.toThrow(/necesita al menos un premio/)
    await db.query('rollback')

    sinTransicion(await estado(puerta.id))
  })
})

// =============================================================================
describe('T2 — los seis premios confirmados en una rifa equivalente (2065)', () => {
  let equivalente: Rifa
  let otraHeredada: Rifa
  let antes: Huella
  let boleta: Record<string, string>
  let inactivo: string
  let historico: { agosto5: string; agosto8: string }
  const sorteos: Record<string, { scheduleId: string; drawNumber: string }> = {}

  beforeAll(async () => {
    equivalente = await nuevaRifa('equivalente', '2065-08-03', '2065-12-31')
    otraHeredada = await nuevaRifa('otra heredada', '2065-08-03', '2065-12-31')

    const ana = ctx.clients.ana.id
    const carlos = ctx.clients.carlos.id
    const ids = await boletas(equivalente.id, [
      { diario: '2468', semanal: '1001', cliente: ana },
      { diario: '1002', semanal: '1357', cliente: ana },
      { diario: '4321', semanal: '1003', cliente: ana },
      { diario: '9321', semanal: '1004', cliente: ana },
      { diario: '7321', semanal: '1005', cliente: carlos },
      { diario: '5555', semanal: '1006', cliente: carlos },
      { diario: '1007', semanal: '6666', cliente: ana },
      { diario: '1008', semanal: '6667', cliente: carlos },
      { diario: '1009', semanal: '7777', cliente: ana },
      { diario: '5556', semanal: '1010', cliente: carlos },
      { diario: '1011', semanal: '1012' },
    ])
    boleta = {
      historicoDiario: ids[0]!,
      historicoSemanal: ids[1]!,
      principal: ids[2]!,
      soloTresDeAna: ids[3]!,
      tresCifras: ids[4]!,
      diario: ids[5]!,
      finDeSemana: ids[6]!,
      especialSemanal: ids[7]!,
      quince: ids[8]!,
      despuesDelDiario: ids[9]!,
      libre: ids[10]!,
    }
    const [otra] = await boletas(otraHeredada.id, [{ diario: '5556', semanal: '2001' }])
    boleta.otraHeredada = otra!

    // Abonos por el camino real, con la sesión del vendedor.
    for (const [ticket, cliente, valor] of [
      [boleta.historicoDiario, ana, 50_000],
      [boleta.principal, ana, 120_000],
      [boleta.tresCifras, carlos, 1],
    ] as const) {
      const { error } = await seller1.rpc('create_payment', {
        p_client_id: cliente,
        p_total_amount: valor,
        p_allocations: [{ ticket_id: ticket, amount: valor }],
      })
      if (error) throw new Error(`No se pudo abonar: ${error.message}`)
    }

    // Sorteos YA RESUELTOS con el sistema de siempre, antes de la transición.
    const agosto5 = await programacion('meta', '2065-08-05')
    const agosto8 = await programacion('boyaca', '2065-08-08')
    historico = {
      agosto5: await confirmar('meta', agosto5.drawNumber, '2468'),
      agosto8: await confirmar('boyaca', agosto8.drawNumber, '1357'),
    }

    // Sorteos FUTUROS con programación y sin resultado: no bloquean nada.
    for (const [clave, loteria, fecha] of [
      ['nov3', 'cruz_roja', '2065-11-03'],
      ['nov7', 'boyaca', '2065-11-07'],
      ['nov30', 'cundinamarca', '2065-11-30'],
      ['dic5', 'boyaca', '2065-12-05'],
      ['dic15', 'cruz_roja', '2065-12-15'],
      ['dic21', 'cundinamarca', '2065-12-21'],
    ] as const) {
      sorteos[clave] = await programacion(loteria, fecha)
    }

    // Una membresía INACTIVA de la organización: no recibe el aviso.
    const email = `transicion-inactiva-${stamp}@demo.test`
    const { data, error } = await ctx.svc.auth.admin.createUser({
      email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Vendedora Inactiva', phone: '3001234567' },
    })
    if (error) throw error
    inactivo = data.user.id
    perfilesCreados.push(inactivo)
    await db.query(
      `insert into memberships (organization_id, profile_id, role, is_active) values ($1, $2, 'seller', false)`,
      [ctx.demoOrg.id, inactivo],
    )

    antes = await huella(equivalente.id)
  }, 120_000)

  it('T2-01: la vista previa devuelve los seis premios y no deja nada escrito', async () => {
    const { data, error } = await transicion(svc, equivalente, configuracionReal())
    expect(error).toBeNull()
    const vista = data as unknown as TransitionResult

    expect(vista).toMatchObject({
      applied: false,
      already_applied: false,
      transition_id: null,
      prize_ids: [],
    })
    expect(
      vista.prizes!.map((p) => [p.position, p.title, p.starts_on, p.ends_on, p.draws]),
    ).toEqual([
      [1, 'Premio diario', '2065-09-01', '2065-11-27', 64],
      [2, 'Premio fin de semana', '2065-09-05', '2065-11-28', 13],
      [3, 'Premio principal', '2065-12-21', '2065-12-21', 1],
      [4, 'Premio especial de tres cifras', '2065-12-21', '2065-12-21', 1],
      [5, 'Premio especial semanal', '2065-12-01', '2065-12-19', 9],
      [6, 'Premio especial del 15 de diciembre', '2065-12-15', '2065-12-15', 1],
    ])
    expect(vista.prizes!.every((p) => p.prize_id === undefined)).toBe(true)

    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from memberships m join profiles p on p.id = m.profile_id
        where m.organization_id = $1 and m.is_active and p.is_active`,
      [ctx.demoOrg.id],
    )
    expect(vista.notified).toBe(rows[0]!.n)

    sinTransicion(await estado(equivalente.id))
    expect(await huella(equivalente.id)).toEqual(antes)
  })

  it('T2-02: organización, rifa, nombre, estado o fechas equivocados no cambian nada', async () => {
    const intentos: Array<[Expectativas, RegExp]> = [
      [{ org: ctx.controlOrg.id }, /no existe en la organización indicada/],
      [
        { raffleId: '11111111-2222-4333-8444-555555555555' },
        /no existe en la organización indicada/,
      ],
      [{ raffleId: otraHeredada.id, name: equivalente.name }, /se llama/],
      [{ name: `${equivalente.name} ` }, /se llama/],
      [{ status: 'draft' }, /está activa y se esperaba que estuviera en borrador/],
      [{ start: '2065-08-04' }, /se esperaban del 04\/08\/2065 al 31\/12\/2065/],
      [{ end: '2065-12-30' }, /Las fechas de la rifa son del 03\/08\/2065 al 31\/12\/2065/],
    ]
    for (const [expectativa, mensaje] of intentos) {
      const { error } = await transicion(svc, equivalente, configuracionReal(), {
        ...expectativa,
        apply: true,
      })
      expect(error?.message).toMatch(mensaje)
    }
    sinTransicion(await estado(equivalente.id))
    sinTransicion(await estado(otraHeredada.id))
    expect(await huella(equivalente.id)).toEqual(antes)
  })

  it('T2-03: la operación interna la hace: la rifa sigue activa, con sus fechas, y la otra sigue heredada', async () => {
    // Antes: sorteos futuros con programación y SIN resultado, que no bloquean.
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from lottery_draw_schedules s
        where s.id = any ($1::uuid[])
          and not exists (select 1 from lottery_results r where r.schedule_id = s.id)`,
      [Object.values(sorteos).map((s) => s.scheduleId)],
    )
    expect(rows[0]!.n).toBe(6)

    const hecho = await aplicar(equivalente, configuracionReal())
    expect(hecho).toMatchObject({ applied: true, already_applied: false })
    expect(hecho.transition_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(hecho.prize_ids).toHaveLength(6)

    expect(await estado(equivalente.id)).toMatchObject({
      modo: 'configurable',
      estado: 'active',
      desde: '2065-08-03',
      hasta: '2065-12-31',
      premios: 6,
      versiones: 6,
      periodos: 7,
      alternativas: 9,
      transiciones: 1,
    })
    sinTransicion(await estado(otraHeredada.id))
  })

  it('T2-04: boletas, clientes, pagos, asignaciones, precios, estados y membresías quedan idénticos', async () => {
    expect(await huella(equivalente.id)).toEqual(antes)

    const { rows } = await db.query<{
      sale_price: number | null
      paid_amount: number
      payment_status: string
      inventory_status: string
    }>(
      `select sale_price::int as sale_price, paid_amount::int as paid_amount,
              payment_status::text as payment_status, inventory_status::text as inventory_status
         from tickets where id = any ($1::uuid[]) order by daily_number`,
      [[boleta.principal, boleta.tresCifras, boleta.libre]],
    )
    expect(rows).toEqual([
      { sale_price: null, paid_amount: 0, payment_status: 'unpaid', inventory_status: 'available' },
      {
        sale_price: 120000,
        paid_amount: 120000,
        payment_status: 'paid',
        inventory_status: 'assigned',
      },
      {
        sale_price: 120000,
        paid_amount: 1,
        payment_status: 'partial',
        inventory_status: 'assigned',
      },
    ])
  })

  it('T2-05: no crea ni modifica fotografías ni enlaces, y no reprocesa resultados', async () => {
    const { rows } = await db.query<{ fotos: number; enlaces: number; confirmadas: string[] }>(
      `select (select count(*)::int from lottery_ticket_matches where raffle_id = $1) as fotos,
              (select count(*)::int from lottery_ticket_match_prizes where raffle_id = $1) as enlaces,
              (select array_agg(confirmed_at::text order by id) from lottery_results where id = any ($2::uuid[])) as confirmadas`,
      [equivalente.id, [historico.agosto5, historico.agosto8]],
    )
    expect(rows[0]!.fotos).toBe(2)
    expect(rows[0]!.enlaces).toBe(0)
    expect(rows[0]!.confirmadas).toHaveLength(2)
    expect(antes.huella_fotografias).toBe((await huella(equivalente.id)).huella_fotografias)
    expect(antes.huella_resultados).toBe((await huella(equivalente.id)).huella_resultados)
  })

  it('T2-06: la configuración guardada es exactamente la confirmada', async () => {
    const { rows } = await db.query<{
      position: number
      title: string
      category: string
      reward_mode: string
      number_field: string
      digits: string
      conditions: string | null
      reward: Array<{ description: string | null; amount: number | null }>
      rules: Array<Record<string, unknown>>
    }>(
      `select p.position, v.title, v.category::text as category, v.reward_mode::text as reward_mode,
              v.number_field::text as number_field, v.digits::text as digits, v.conditions,
              raffle_prize_reward_json(v.id) as reward, raffle_prize_rules_json(v.id) as rules
         from raffle_prizes p join raffle_prize_versions v on v.id = p.current_version_id
        where p.raffle_id = $1 order by p.position`,
      [equivalente.id],
    )

    expect(
      rows.map((row) => ({
        title: row.title,
        category: row.category,
        reward_mode: row.reward_mode,
        reward_options: row.reward,
        number_field: row.number_field,
        digits: row.digits,
        rules: row.rules,
        conditions: row.conditions,
      })),
    ).toEqual(configuracionReal())
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('T2-07: cada premio juega los días, las loterías, el número y las cifras que se confirmaron', async () => {
    const { rows } = await db.query<{ title: string; days: string[] }>(
      `select v.title,
              array_agg(e.reference_date::text || ':' || e.lottery_code::text order by e.reference_date) as days
         from raffle_prizes p
         join raffle_prize_versions v on v.id = p.current_version_id
         cross join lateral raffle_prize_rule_dates(v.id) e
        where p.raffle_id = $1
        group by v.title, p.position
        order by p.position`,
      [equivalente.id],
    )
    const dias = Object.fromEntries(rows.map((row) => [row.title, row.days]))

    // El diario termina el viernes 27 de noviembre y no llega a diciembre.
    expect(dias['Premio diario']!.at(-1)).toBe('2065-11-27:medellin')
    expect(dias['Premio diario']!.some((d) => d.startsWith('2065-12'))).toBe(false)
    // El de fin de semana: solo sábados, solo Boyacá, hasta el 28.
    expect(dias['Premio fin de semana']!.at(-1)).toBe('2065-11-28:boyaca')
    expect(dias['Premio fin de semana']!.every((d) => d.endsWith(':boyaca'))).toBe(true)
    // El 21: principal y tres cifras, el mismo día y la misma lotería.
    expect(dias['Premio principal']).toEqual(['2065-12-21:cundinamarca'])
    expect(dias['Premio especial de tres cifras']).toEqual(['2065-12-21:cundinamarca'])
    // Los dos tramos del millón semanal, sábados incluidos.
    expect(dias['Premio especial semanal']).toEqual([
      '2065-12-01:cruz_roja',
      '2065-12-02:meta',
      '2065-12-03:bogota',
      '2065-12-04:medellin',
      '2065-12-05:boyaca',
      '2065-12-16:meta',
      '2065-12-17:bogota',
      '2065-12-18:medellin',
      '2065-12-19:boyaca',
    ])
    // El 15, Cruz Roja.
    expect(dias['Premio especial del 15 de diciembre']).toEqual(['2065-12-15:cruz_roja'])
  })

  it('T2-08: el ejemplo «semanal, un lunes, con Cundinamarca» no está en la rifa', async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n
         from raffle_prizes p
         join raffle_prize_versions v on v.id = p.current_version_id
         cross join lateral raffle_prize_rule_dates(v.id) e
        where p.raffle_id = $1
          and v.number_field = 'weekly_number'
          and e.lottery_code = 'cundinamarca'`,
      [equivalente.id],
    )
    expect(rows[0]!.n).toBe(0)
  })

  it('T2-09: el historial dice que lo publicó el sistema', async () => {
    const { rows } = await db.query<{ id: string; created_by: string | null }>(
      `select id, created_by from raffle_prizes where raffle_id = $1 order by position`,
      [equivalente.id],
    )
    expect(rows.every((row) => row.created_by === null)).toBe(true)

    const { data, error } = await owner.rpc('raffle_prize_history', { p_prize_id: rows[0]!.id })
    expect(error).toBeNull()
    const versiones = data as unknown as Array<{
      change: string
      published_by: string | null
      published_by_name: string | null
    }>
    expect(versiones).toHaveLength(1)
    expect(versiones[0]).toMatchObject({ change: 'created', published_by: null })
    expect(prizeActorLabel(versiones[0]!.published_by_name)).toBe('Sistema')
  })

  it('T2-10: una sola fila semántica de bitácora, del sistema, sin nada de la cartera', async () => {
    const { rows } = await db.query<{
      action: string
      actor_profile_id: string | null
      old_values: Record<string, unknown>
      new_values: Record<string, unknown>
    }>(
      `select action, actor_profile_id, old_values, new_values from audit_logs
        where entity_id = $1 and action in ('raffle.prize_mode_transition', 'raffle.update')
        order by id`,
      [equivalente.id],
    )
    const semantica = rows.filter((row) => row.action === 'raffle.prize_mode_transition')
    expect(semantica).toHaveLength(1)
    expect(semantica[0]!.actor_profile_id).toBeNull()
    expect(semantica[0]!.old_values).toEqual({ prize_mode: 'legacy' })
    expect(semantica[0]!.new_values).toMatchObject({
      prize_mode: 'configurable',
      status: 'active',
      prize_count: 6,
    })

    const modo = rows.filter(
      (row) => row.action === 'raffle.update' && 'prize_mode' in row.new_values,
    )
    expect(modo).toHaveLength(1)
    expect(modo[0]!.new_values).toEqual({ prize_mode: 'configurable' })

    const texto = JSON.stringify(semantica[0]!.new_values)
    for (const prohibido of [
      'client',
      'sale_price',
      'paid',
      'payment',
      'balance',
      ctx.clients.ana.id,
    ]) {
      expect(texto).not.toContain(prohibido)
    }
    expect((await estado(equivalente.id)).bitacora_de_premios).toBe(0)
  })

  it('T2-11: un aviso por membresía activa de la organización, ninguno a la inactiva ni a otra organización', async () => {
    const { rows: avisos } = await db.query<{
      recipient_profile_id: string
      organization_id: string
      data: Record<string, unknown>
    }>(
      `select recipient_profile_id, organization_id, data from notifications
        where kind = 'raffle_prize.changed' and (data ->> 'raffle_id')::uuid = $1`,
      [equivalente.id],
    )
    const { rows: activas } = await db.query<{ profile_id: string }>(
      `select m.profile_id from memberships m join profiles p on p.id = m.profile_id
        where m.organization_id = $1 and m.is_active and p.is_active`,
      [ctx.demoOrg.id],
    )

    expect(avisos.map((a) => a.recipient_profile_id).sort()).toEqual(
      activas.map((a) => a.profile_id).sort(),
    )
    expect(new Set(avisos.map((a) => a.recipient_profile_id)).size).toBe(avisos.length)
    expect(avisos.map((a) => a.recipient_profile_id)).not.toContain(inactivo)
    expect(avisos.every((a) => a.organization_id === ctx.demoOrg.id)).toBe(true)
    expect(avisos[0]!.data).toEqual({
      raffle_id: equivalente.id,
      raffle_name: equivalente.name,
      change: 'transitioned',
      prize_count: 6,
    })

    const { rows: vendedor } = await db.query<{ n: number }>(
      `select count(*)::int as n from notifications where recipient_profile_id = $1
         and kind = 'raffle_prize.changed' and (data ->> 'raffle_id')::uuid = $2`,
      [ctx.ids.seller1, equivalente.id],
    )
    expect(vendedor[0]!.n).toBe(1)
  })

  it('T2-12: el Dueño, el Administrador y el vendedor leen los seis premios; otra organización, ninguno', async () => {
    for (const cliente of [owner, admin, seller1]) {
      const { data, error } = await cliente
        .from('raffle_prizes')
        .select(
          'position, status, current:raffle_prize_versions!raffle_prizes_current_version_fk(title)',
        )
        .eq('raffle_id', equivalente.id)
        .order('position')
      expect(error).toBeNull()
      expect(
        (data ?? []).map((row) => (row.current as unknown as { title: string }).title),
      ).toEqual([
        'Premio diario',
        'Premio fin de semana',
        'Premio principal',
        'Premio especial de tres cifras',
        'Premio especial semanal',
        'Premio especial del 15 de diciembre',
      ])
    }
    const ajena = await otherOrgOwner
      .from('raffle_prizes')
      .select('id')
      .eq('raffle_id', equivalente.id)
    expect(ajena.data).toEqual([])
  })

  it('T2-13: repetir la misma transición no escribe nada', async () => {
    const antesDeRepetir = await estado(equivalente.id)
    const primera = await aplicar(equivalente, configuracionReal())
    const segunda = await aplicar(equivalente, configuracionReal())
    for (const repetida of [primera, segunda]) {
      expect(repetida).toMatchObject({ applied: false, already_applied: true, notified: 0 })
      expect(repetida.prize_ids).toHaveLength(6)
    }
    const vista = await transicion(svc, equivalente, configuracionReal())
    expect(vista.data).toMatchObject({ applied: false, already_applied: true })

    expect(await estado(equivalente.id)).toEqual(antesDeRepetir)
  })

  it('T2-14: otra configuración sobre una rifa ya convertida se rechaza sin tocar nada', async () => {
    const antesDeIntentar = await estado(equivalente.id)
    const distinta = configuracionReal().slice(0, 5)
    const { error } = await transicion(svc, equivalente, distinta, {
      status: 'active',
      apply: true,
    })
    expect(error?.message).toContain('ya pasó a premios configurables con otra configuración')
    expect(await estado(equivalente.id)).toEqual(antesDeIntentar)
  })

  it('T2-15: después, el motor encuentra las coincidencias con los premios confirmados', async () => {
    const enlaces = async (resultId: string) => {
      const { rows } = await db.query<{
        ticket_id: string
        title: string | null
        digits: string | null
        raffle_id: string
      }>(
        `select m.ticket_id, v.title, v.digits::text as digits, m.raffle_id
           from lottery_ticket_matches m
           left join lottery_ticket_match_prizes l on l.match_id = m.id
           left join raffle_prize_versions v on v.id = l.prize_version_id
          where m.result_id = $1
          order by v.title nulls last, m.ticket_id`,
        [resultId],
      )
      return rows
    }

    // 21 de diciembre: cuatro cifras mandan sobre tres POR CLIENTE.
    const dic21 = await confirmar('cundinamarca', sorteos.dic21!.drawNumber, '4321')
    expect(await enlaces(dic21)).toEqual([
      {
        ticket_id: boleta.tresCifras,
        title: 'Premio especial de tres cifras',
        digits: 'last_three',
        raffle_id: equivalente.id,
      },
      {
        ticket_id: boleta.principal,
        title: 'Premio principal',
        digits: 'four',
        raffle_id: equivalente.id,
      },
    ])

    const nov3 = await confirmar('cruz_roja', sorteos.nov3!.drawNumber, '5555')
    expect((await enlaces(nov3)).map((e) => [e.ticket_id, e.title])).toEqual([
      [boleta.diario, 'Premio diario'],
    ])

    const nov7 = await confirmar('boyaca', sorteos.nov7!.drawNumber, '6666')
    expect((await enlaces(nov7)).map((e) => [e.ticket_id, e.title])).toEqual([
      [boleta.finDeSemana, 'Premio fin de semana'],
    ])

    const dic5 = await confirmar('boyaca', sorteos.dic5!.drawNumber, '6667')
    expect((await enlaces(dic5)).map((e) => [e.ticket_id, e.title])).toEqual([
      [boleta.especialSemanal, 'Premio especial semanal'],
    ])

    const dic15 = await confirmar('cruz_roja', sorteos.dic15!.drawNumber, '7777')
    expect((await enlaces(dic15)).map((e) => [e.ticket_id, e.title])).toEqual([
      [boleta.quince, 'Premio especial del 15 de diciembre'],
    ])

    // El lunes 30 de noviembre el diario ya terminó: la rifa convertida no
    // coincide, y la heredada sigue comparando como siempre.
    const nov30 = await confirmar('cundinamarca', sorteos.nov30!.drawNumber, '5556')
    expect(await enlaces(nov30)).toEqual([
      { ticket_id: boleta.otraHeredada, title: null, digits: null, raffle_id: otraHeredada.id },
    ])
  })

  it('T2-16: volver a confirmar un sorteo anterior a la transición no cambia sus fotografías', async () => {
    const fotos = async () => {
      const { rows } = await db.query<{ huella: string; enlaces: number }>(
        `select md5(string_agg(m::text, '|' order by m.id)) as huella,
                (select count(*)::int from lottery_ticket_match_prizes l
                  where l.result_id = any ($1::uuid[])) as enlaces
           from lottery_ticket_matches m where m.result_id = any ($1::uuid[])`,
        [[historico.agosto5, historico.agosto8]],
      )
      return rows[0]!
    }
    const antesDeConfirmar = await fotos()
    expect(antesDeConfirmar.enlaces).toBe(0)

    const { rows: programadas } = await db.query<{
      lottery_code: Loteria
      draw_number: string
      winning_number: string
    }>(
      `select s.lottery_code::text as lottery_code, s.draw_number, r.winning_number
         from lottery_results r join lottery_draw_schedules s on s.id = r.schedule_id
        where r.id = any ($1::uuid[])`,
      [[historico.agosto5, historico.agosto8]],
    )
    for (const sorteo of programadas) {
      await confirmar(sorteo.lottery_code, sorteo.draw_number, sorteo.winning_number)
    }

    expect(await fotos()).toEqual(antesDeConfirmar)
  })
})

// =============================================================================
describe('T3 — lo que impide la transición, y lo que no', () => {
  it('T3-01: una rifa heredada con premios ya guardados —una configuración parcial— se rechaza entera', async () => {
    const parcial = await nuevaRifa('parcial', '2065-01-05', '2065-03-31')
    const premioId = randomUUID()
    await db.query('begin')
    await db.query(
      `select raffle_prize_insert_version($1, $2, $3, gen_random_uuid(), 1, null, 'active', 'Premio suelto',
         'daily', 'fixed', '[{"description": null, "amount": 1000}]'::jsonb, 'daily_number', 'four', null,
         '[{"start_date": "2065-01-06", "end_date": "2065-01-06", "weekdays": [2], "lottery_mode": "corresponding", "lottery_code": null}]'::jsonb,
         null)`,
      [parcial.organization_id, parcial.id, premioId],
    )
    await db.query(
      `insert into raffle_prizes (id, organization_id, raffle_id, status, position, current_version_id)
       select $1, $2, $3, 'active', 1, v.id from raffle_prize_versions v where v.prize_id = $1`,
      [premioId, parcial.organization_id, parcial.id],
    )
    await db.query('commit')

    const { error } = await transicion(svc, parcial, [premioDeUnDia('2065-01-07')], { apply: true })
    expect(error?.message).toContain('ya tiene premios guardados')
    expect(await estado(parcial.id)).toMatchObject({
      modo: 'legacy',
      premios: 1,
      transiciones: 0,
      avisos: 0,
    })
  })

  it('T3-02: un conflicto entre dos premios deshace TODO, también los que ya se habían escrito', async () => {
    const conflicto = await nuevaRifa('conflicto', '2065-08-03', '2065-12-31')
    const premios = configuracionReal()
    premios[0] = {
      ...premios[0]!,
      rules: [{ ...premios[0]!.rules[0]!, end_date: '2065-12-31' }],
    }
    // El diario va primero y el principal tercero: cuando choca, ya hay dos
    // premios escritos en la transacción.
    const { error } = await transicion(svc, conflicto, premios, { apply: true })
    expect(error?.message).toContain('«Premio principal» y el premio «Premio diario»')
    expect(error?.message).toContain('21/12/2065')
    sinTransicion(await estado(conflicto.id))

    const vista = await transicion(svc, conflicto, premios)
    expect(vista.error?.message).toBe(error?.message)
    sinTransicion(await estado(conflicto.id))
  })

  it('T3-03: un premio que incluye un sorteo ya jugado no se carga tarde', async () => {
    const tarde = await nuevaRifa('ya jugado', '2018-06-06', '2018-06-06')
    const { scheduleId } = await programacion('meta', '2018-06-06')
    await resultado(scheduleId, '1234')

    const { error } = await transicion(svc, tarde, [premioDeUnDia('2018-06-06')], { apply: true })
    expect(error?.message).toBe(
      'La hora del sorteo de Meta del 06/06/2018 ya pasó, así que el premio «Premio de un día» no puede incluirlo. Haz que empiece en el siguiente sorteo.',
    )
    sinTransicion(await estado(tarde.id))
  })

  it('T3-04: un sorteo ADELANTADO que ya se jugó corta en su hora oficial, no en la original', async () => {
    // Junio de 2065: fuera de cualquier calendario de la configuración real, que
    // otros escenarios de esta suite cargan de septiembre a diciembre.
    const adelantada = await nuevaRifa('adelantado', '2065-06-01', '2065-06-06')
    const { scheduleId } = await programacion('meta', '2065-06-03', {
      original: '2065-06-03T22:30:00-05:00',
      oficial: new Date(Date.now() - 3_600_000).toISOString(),
      estado: 'rescheduled_earlier',
    })
    await resultado(scheduleId, '4321')

    const { error } = await transicion(svc, adelantada, [premioDeUnDia('2065-06-03')], {
      apply: true,
    })
    expect(error?.message).toContain('La hora del sorteo de Meta del 03/06/2065 ya pasó')
    sinTransicion(await estado(adelantada.id))
  })

  it('T3-05: un sorteo jugado sin resultado confirmado detiene la transición de una rifa activa', async () => {
    const pendiente = await nuevaRifa('pendiente', '2018-06-05', '2018-06-05')
    const { scheduleId } = await programacion('cruz_roja', '2018-06-05')
    const premio = [premioDeUnDia('2018-06-05')]
    const mensaje =
      'El sorteo de Cruz Roja del 05/06/2018 ya se jugó y todavía no tiene el resultado confirmado. Espera a que se confirme antes de la transición: si no, se buscaría con los premios nuevos.'

    const sinResultado = await transicion(svc, pendiente, premio, { apply: true })
    expect(sinResultado.error?.message).toBe(mensaje)
    expect(sinResultado.error?.details).toBe(
      'Sorteo pendiente: Cruz Roja del 05/06/2018 (resultado sin confirmar)',
    )

    await resultado(scheduleId, '1111', 'pending')
    expect((await transicion(svc, pendiente, premio, { apply: true })).error?.message).toBe(mensaje)

    await db.query(
      `update lottery_results set validation_status = 'conflict' where schedule_id = $1`,
      [scheduleId],
    )
    expect((await transicion(svc, pendiente, premio, { apply: true })).error?.message).toBe(mensaje)

    // Confirmado, la espera termina: lo que falla ahora es el premio, que incluye ese sorteo.
    await db.query(
      `update lottery_results set validation_status = 'confirmed', confirmed_at = now() where schedule_id = $1`,
      [scheduleId],
    )
    expect((await transicion(svc, pendiente, premio, { apply: true })).error?.message).toContain(
      'ya pasó, así que el premio',
    )
    sinTransicion(await estado(pendiente.id))
  })

  it('T3-06: sin hora oficial en una semana ya empezada, no se supone nada', async () => {
    const desconocida = await nuevaRifa('hora desconocida', '2018-06-04', '2018-06-04')
    await programacion('cundinamarca', '2018-06-04', {
      original: null,
      oficial: null,
      estado: 'schedule_unverified',
    })

    const { error } = await transicion(svc, desconocida, [premioDeUnDia('2018-06-04')], {
      apply: true,
    })
    expect(error?.message).toBe(
      'Todavía no conocemos la hora oficial del sorteo de Cundinamarca del 04/06/2018, así que no sabemos si ya se jugó. Vuelve a intentarlo cuando la programación oficial la publique.',
    )
    sinTransicion(await estado(desconocida.id))
  })

  it('T3-07: con varios sorteos pendientes dice cuántos, el primero, y los enumera todos', async () => {
    const varios = await nuevaRifa('varios pendientes', '2018-06-11', '2018-06-16')
    const { error } = await transicion(svc, varios, [premioDeUnDia('2018-06-11')], { apply: true })
    expect(error?.message).toContain('Hay 6 sorteos de la rifa sin resultado confirmado')
    expect(error?.message).toContain('El primero es el de Cundinamarca del 11/06/2018.')
    expect(error?.details).toBe(
      '6 sorteos pendientes: Cundinamarca del 11/06/2018 (hora oficial desconocida); ' +
        'Cruz Roja del 12/06/2018 (hora oficial desconocida); Meta del 13/06/2018 (hora oficial desconocida); ' +
        'Bogotá del 14/06/2018 (hora oficial desconocida); Medellín del 15/06/2018 (hora oficial desconocida); ' +
        'Boyacá del 16/06/2018 (hora oficial desconocida)',
    )
    sinTransicion(await estado(varios.id))
  })

  it('T3-08: la clasificación de los sorteos pendientes, con un instante fijo', async () => {
    // Del lunes 2 al sábado 14 de marzo de 2065, mirado el miércoles 4 a las 11 p. m.
    const ventana = await nuevaRifa('clasificación', '2065-03-02', '2065-03-14')
    const lunes = await programacion('cundinamarca', '2065-03-02')
    await resultado(lunes.scheduleId, '1000')
    await programacion('cruz_roja', '2065-03-03')
    const miercoles = await programacion('meta', '2065-03-04')
    await resultado(miercoles.scheduleId, '3000', 'pending')
    // Jueves 5: sin programación. Viernes 6: todavía no juega.
    await programacion('medellin', '2065-03-06')
    await programacion('boyaca', '2065-03-07', { estado: 'cancelled' })
    // La semana siguiente no ha empezado: aunque no tenga programación, no cuenta.

    const { rows } = await db.query<{
      reference_date: string
      lottery_code: string
      reason: string
    }>(
      `select reference_date::text, lottery_code::text, reason
         from raffle_prize_transition_pending_draws(
           (select r from raffles r where r.id = $1), '2065-03-04T23:00:00-05:00'::timestamptz)`,
      [ventana.id],
    )
    expect(rows).toEqual([
      { reference_date: '2065-03-03', lottery_code: 'cruz_roja', reason: 'unconfirmed_result' },
      { reference_date: '2065-03-04', lottery_code: 'meta', reason: 'unconfirmed_result' },
      { reference_date: '2065-03-05', lottery_code: 'bogota', reason: 'unknown_schedule' },
    ])
  })

  it('T3-09: un sorteo cancelado no detiene la transición', async () => {
    const cancelada = await nuevaRifa('cancelado', '2018-06-18', '2018-06-18')
    await programacion('cundinamarca', '2018-06-18', { estado: 'cancelled' })
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from raffle_prize_transition_pending_draws(
         (select r from raffles r where r.id = $1), now())`,
      [cancelada.id],
    )
    expect(rows[0]!.n).toBe(0)
  })

  it('T3-10: una rifa cerrada o anulada no cambia de sistema, y una que nació configurable no la necesita', async () => {
    for (const estadoFinal of ['closed', 'cancelled'] as const) {
      const cerrada = await nuevaRifa(`estado ${estadoFinal}`, '2065-01-05', '2065-03-31', {
        estado: estadoFinal,
      })
      const { error } = await transicion(svc, cerrada, [premioDeUnDia('2065-01-07')], {
        apply: true,
      })
      expect(error?.message).toBe('Una rifa cerrada o anulada no cambia de sistema de premios.')
      sinTransicion(await estado(cerrada.id))
    }

    const nueva = await nuevaRifa('nacida configurable', '2065-01-05', '2065-03-31', {
      estado: 'draft',
      modo: 'configurable',
    })
    const { error } = await transicion(svc, nueva, [premioDeUnDia('2065-01-07')], { apply: true })
    expect(error?.message).toBe(
      'Esta rifa ya usa premios configurables, así que no necesita la transición.',
    )
  })

  it('T3-11: un borrador heredado también hace la transición, sigue en borrador y no avisa (BR-J11)', async () => {
    const borrador = await nuevaRifa('borrador', '2065-01-05', '2065-03-31', { estado: 'draft' })
    const hecho = await aplicar(borrador, [premioDeUnDia('2065-01-07')])
    expect(hecho).toMatchObject({ applied: true, notified: 0 })
    expect(await estado(borrador.id)).toMatchObject({
      modo: 'configurable',
      estado: 'draft',
      premios: 1,
      transiciones: 1,
      avisos: 0,
      bitacora: 1,
    })
  })
})

// =============================================================================
describe('T4 — reintentos y concurrencia', () => {
  it('T4-01: un intento fallido no deja nada, y el siguiente aplica una sola vez', async () => {
    const reintento = await nuevaRifa('reintento', '2065-08-03', '2065-12-31')
    const fallido = await transicion(svc, reintento, configuracionReal(), {
      name: 'Otro nombre',
      apply: true,
    })
    expect(fallido.error).not.toBeNull()
    sinTransicion(await estado(reintento.id))

    await aplicar(reintento, configuracionReal())
    await aplicar(reintento, configuracionReal())
    expect(await estado(reintento.id)).toMatchObject({
      modo: 'configurable',
      premios: 6,
      versiones: 6,
      transiciones: 1,
      bitacora: 1,
      cambios_de_modo: 1,
    })
  })

  it('T4-02: dos transiciones a la vez de la misma rifa: una la hace y la otra la encuentra hecha', async () => {
    const concurrida = await nuevaRifa('concurrencia', '2065-08-03', '2065-12-31')
    const llamada = `select transition_raffle_prize_mode($1, $2, $3, 'active', $4, $5, $6::jsonb, true) as r`
    const params = [
      concurrida.organization_id,
      concurrida.id,
      concurrida.name,
      concurrida.start_date,
      concurrida.end_date,
      JSON.stringify(configuracionReal()),
    ]

    const primera = new PgClient({ connectionString: DB_URL })
    const segunda = new PgClient({ connectionString: DB_URL })
    await Promise.all([primera.connect(), segunda.connect()])
    try {
      await primera.query('begin')
      const uno = await primera.query<{ r: TransitionResult }>(llamada, params)
      expect(uno.rows[0]!.r.applied).toBe(true)

      // La segunda espera el cerrojo de la rifa mientras la primera no termina.
      let terminoAntes = false
      const dos = segunda.query<{ r: TransitionResult }>(llamada, params).then((resultado) => {
        terminoAntes = true
        return resultado
      })
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(terminoAntes).toBe(false)

      await primera.query('commit')
      const segundaRespuesta = (await dos).rows[0]!.r
      expect(segundaRespuesta).toMatchObject({ applied: false, already_applied: true })
    } finally {
      await Promise.all([primera.end(), segunda.end()])
    }

    expect(await estado(concurrida.id)).toMatchObject({ premios: 6, transiciones: 1, bitacora: 1 })
  })
})

// =============================================================================
describe('T5 — los espejos de los textos', () => {
  it('T5-01: los nombres de las loterías y de los estados son los de la aplicación', async () => {
    for (const [codigo, nombre] of Object.entries(LOTTERY_LABELS)) {
      const { rows } = await db.query<{ label: string }>(
        `select raffle_prize_lottery_label($1::lottery_code) as label`,
        [codigo],
      )
      expect(rows[0]!.label).toBe(nombre)
    }
    const { rows } = await db.query<{ phrases: string[] }>(
      `select array_agg(raffle_prize_raffle_status_phrase(s) order by s) as phrases
         from unnest(enum_range(null::raffle_status)) s`,
    )
    expect(rows[0]!.phrases).toEqual(['en borrador', 'activa', 'cerrada', 'anulada'])
  })
})
