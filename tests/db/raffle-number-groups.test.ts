/**
 * Los números de cada boleta los define su rifa (D-261, migraciones 0083 y 0084).
 *
 * LO QUE SOLO LA BASE PUEDE GARANTIZAR: que la estructura no se cambia por
 * ninguna vía —tampoco en borrador, tampoco con la clave de servicio—, que cada
 * número tiene exactamente las cifras de su grupo en TODAS las vías de entrada,
 * que la unicidad de un solo número no depende de nulos —ni en paralelo—, que el
 * generador toma el ancho de la rifa y conserva su continuidad, que lo que ya
 * existía fuera de formato no se toca pero no entra en una venta, y que el motor
 * compara dos cifras con sus ceros y aplica 4 > 3 > 2 por cliente, rifa y sorteo.
 *
 * Sesiones reales para lo que se afirma de una persona (D-043); `pg` como
 * `postgres` solo prepara, mueve lo que no tiene pantalla y comprueba.
 *
 * DATOS PROPIOS. Rifas «D261 …» y sorteos «D261-…» en 2084, que ninguna otra
 * suite usa: el motor mira TODAS las rifas que juegan una fecha. Todo se borra al
 * final con `session_replication_role = replica`, porque fotografías y enlaces
 * son inmutables también para la service role.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { GROUP_RANGE_MESSAGES } from '@/features/inventory/rules'
import {
  NUMBER_GROUPS_MESSAGES,
  numberGroupsProblem,
  ticketNumbersProblem,
  type RaffleNumberFormat,
} from '@/lib/ticket-number-format'

import {
  DB_URL,
  loadSeedContext,
  runLotteryEngine,
  signInAs,
  USERS,
  voidPaymentAs,
  type Client,
} from './helpers'

const PREFIJO = 'D261'
const stamp = Date.now().toString(36)

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let db: PgClient
let owner: Client
let admin: Client
let seller1: Client
let seller2: Client
let otherOrgOwner: Client

type Grupos = { count: 1 | 2; n1: string; d1: 2 | 3 | 4; n2?: string; d2?: 2 | 3 | 4 }

const UNO_3: Grupos = { count: 1, n1: 'Número', d1: 3 }
const MAYOR_SECO: Grupos = { count: 2, n1: 'Mayor', d1: 4, n2: 'Seco', d2: 2 }

let secuencia = 0

// -----------------------------------------------------------------------------
// Ayudantes
// -----------------------------------------------------------------------------

async function nuevaRifa(
  nombre: string,
  grupos: Grupos,
  opciones: {
    status?: 'draft' | 'active'
    modo?: 'legacy' | 'configurable'
    desde?: string
    hasta?: string
    vendedoresCrean?: boolean
  } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into raffles (organization_id, name, ticket_price, status, start_date, end_date, created_by,
                          prize_mode, allow_seller_ticket_creation, number_group_count,
                          first_group_name, first_group_digits, second_group_name, second_group_digits)
     values ($1, $2, 120000, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning id`,
    [
      ctx.demoOrg.id,
      `${PREFIJO} ${nombre} ${stamp}`,
      opciones.status ?? 'active',
      opciones.desde ?? '2026-01-01',
      opciones.hasta ?? '2026-12-31',
      ctx.ids.owner,
      opciones.modo ?? 'legacy',
      opciones.vendedoresCrean ?? false,
      grupos.count,
      grupos.n1,
      grupos.d1,
      grupos.count === 2 ? grupos.n2 : null,
      grupos.count === 2 ? grupos.d2 : null,
    ],
  )
  return rows[0]!.id
}

/** Una boleta de un vendedor, por `pg`, con el disparador de formato activo. */
async function boletaPg(
  raffleId: string,
  diario: string | null,
  semanal: string | null,
  estado: 'available' | 'draft' | 'pending_approval' = 'available',
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number, weekly_number,
                          inventory_status)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [ctx.demoOrg.id, raffleId, ctx.ids.seller1, ctx.ids.owner, diario, semanal, estado],
  )
  return rows[0]!.id
}

/**
 * El mensaje con el que la base rechaza algo, o `null` si lo admite. Va en su
 * propia transacción y se deshace siempre: lo que se prueba es la respuesta.
 */
async function rechazo(sql: string, params: unknown[]): Promise<string | null> {
  await db.query('begin')
  try {
    await db.query(sql, params)
    return null
  } catch (error) {
    return (error as Error).message
  } finally {
    await db.query('rollback')
  }
}

async function enTransaccion<T>(fn: () => Promise<T>): Promise<T> {
  await db.query('begin')
  try {
    const out = await fn()
    await db.query('commit')
    return out
  } catch (error) {
    await db.query('rollback')
    throw error
  }
}

/** Una boleta como las de ANTES de la 0084: fuera del formato de su rifa. */
async function boletaHeredada(
  raffleId: string,
  diario: string,
  semanal: string | null,
  estado: 'available' | 'pending_approval',
): Promise<string> {
  secuencia += 1
  return enTransaccion(async () => {
    // Sin disparadores nadie pone `number_group_count`: se copia de la rifa, como
    // haría la 0084 al añadir la columna.
    await db.query(`set local session_replication_role = replica`)
    const { rows } = await db.query<{ id: string }>(
      `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number,
                            weekly_number, inventory_status, internal_code, number_group_count)
       values ($1, $2, $3, $4, $5, $6, $7, $8,
               (select number_group_count from raffles where id = $2)) returning id`,
      [
        ctx.demoOrg.id,
        raffleId,
        ctx.ids.seller1,
        ctx.ids.owner,
        diario,
        semanal,
        estado,
        `${PREFIJO}-${stamp}-${secuencia}`,
      ],
    )
    return rows[0]!.id
  })
}

type Run = {
  outcome: string
  run_id: string
  daily_from: string
  daily_to: string
  weekly_from: string | null
  weekly_to: string | null
  total_count: number
  processed_count: number
  created_count: number
  existing_count: number
  status: string
}

async function empezar(
  raffleId: string,
  daily: [string, string],
  weekly: [string, string] = ['', ''],
  requestId: string = crypto.randomUUID(),
) {
  return owner.rpc('admin_start_ticket_generation', {
    p_raffle_id: raffleId,
    p_daily_from: daily[0],
    p_daily_to: daily[1],
    p_weekly_from: weekly[0],
    p_weekly_to: weekly[1],
    p_request_id: requestId,
  })
}

async function bloque(run: Run): Promise<Run> {
  const { data, error } = await owner.rpc('admin_process_ticket_generation', {
    p_run_id: run.run_id,
    p_processed_count: run.processed_count,
  })
  if (error) throw new Error(`Bloque: ${error.message}`)
  return data![0] as Run
}

async function generar(raffleId: string, daily: [string, string], weekly?: [string, string]): Promise<Run> {
  const { data, error } = await empezar(raffleId, daily, weekly)
  if (error) throw new Error(`Empezar: ${error.message}`)
  let run = data![0] as Run
  while (run.status !== 'completed') run = await bloque(run)
  return run
}

async function numerosDe(raffleId: string): Promise<string[]> {
  const { rows } = await db.query<{ n: string }>(
    `select coalesce(daily_number, '∅') || '/' || coalesce(weekly_number, '∅') as n
       from tickets where raffle_id = $1 order by daily_number, weekly_number`,
    [raffleId],
  )
  return rows.map((r) => r.n)
}

async function idDe(raffleId: string, diario: string, semanal: string | null): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `select id from tickets where raffle_id = $1 and daily_number = $2
        and weekly_number is not distinct from $3`,
    [raffleId, diario, semanal],
  )
  if (!rows[0]) throw new Error(`No existe la boleta ${diario}/${semanal}`)
  return rows[0].id
}

async function nuevoCliente(nombre: string, sellerId = ctx.ids.seller1): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into clients (organization_id, seller_id, name, phone)
     values ($1, $2, $3, '3001112233') returning id`,
    [ctx.demoOrg.id, sellerId, `${PREFIJO} ${nombre} ${stamp}`],
  )
  return rows[0]!.id
}

// -----------------------------------------------------------------------------
// Limpieza
// -----------------------------------------------------------------------------

async function limpiar(): Promise<void> {
  await db.query('begin')
  try {
    await db.query(`set local session_replication_role = replica`)
    const { rows } = await db.query<{ id: string }>(`select id from raffles where name like $1`, [
      `${PREFIJO} %`,
    ])
    const rifas = rows.map((r) => r.id)
    const { rows: sorteos } = await db.query<{ id: string }>(
      `select id from lottery_draw_schedules where draw_number like 'D261-%'`,
    )
    const sorteoIds = sorteos.map((s) => s.id)
    await db.query(
      `delete from lottery_ticket_match_prizes
        where raffle_id = any ($1::uuid[])
           or result_id in (select id from lottery_results where schedule_id = any ($2::uuid[]))`,
      [rifas, sorteoIds],
    )
    await db.query(
      `delete from lottery_ticket_matches
        where raffle_id = any ($1::uuid[])
           or result_id in (select id from lottery_results where schedule_id = any ($2::uuid[]))`,
      [rifas, sorteoIds],
    )
    await db.query(
      `delete from notifications
        where entity_id in (select id from lottery_results where schedule_id = any ($2::uuid[]))
           or entity_id in (select id from tickets where raffle_id = any ($1::uuid[]))
           or (data ->> 'raffle_id') = any (select unnest($1::uuid[])::text)`,
      [rifas, sorteoIds],
    )
    await db.query(`delete from lottery_results where schedule_id = any ($1::uuid[])`, [sorteoIds])
    await db.query(`delete from lottery_draw_schedules where id = any ($1::uuid[])`, [sorteoIds])
    await db.query(`delete from ticket_holds where raffle_id = any ($1::uuid[])`, [rifas])
    // Los pagos de G7-03 se van con sus asignaciones: un pago sin ellas rompe
    // «todo pago cuadra con sus asignaciones» (catalog.test.ts, BR-F05).
    const { rows: pagos } = await db.query<{ id: string }>(
      `select distinct payment_id as id from payment_allocations
        where ticket_id in (select id from tickets where raffle_id = any ($1::uuid[]))`,
      [rifas],
    )
    const pagoIds = pagos.map((p) => p.id)
    await db.query(
      `delete from audit_logs
        where entity_id in (select id from tickets where raffle_id = any ($1::uuid[]))
           or entity_id = any ($1::uuid[])
           or entity_id = any ($2::uuid[])
           or entity_id in (select id from ticket_generation_runs where raffle_id = any ($1::uuid[]))
           or (coalesce(new_values, old_values) ->> 'raffle_id') = any (select unnest($1::uuid[])::text)`,
      [rifas, pagoIds],
    )
    await db.query(`delete from notifications where entity_id = any ($1::uuid[])`, [pagoIds])
    await db.query(
      `delete from payment_allocations where ticket_id in (select id from tickets where raffle_id = any ($1::uuid[]))`,
      [rifas],
    )
    await db.query(`delete from payments where id = any ($1::uuid[])`, [pagoIds])
    await db.query(`delete from commission_ledger where raffle_id = any ($1::uuid[])`, [rifas])
    await db.query(`delete from seller_commissions where raffle_id = any ($1::uuid[])`, [rifas])
    await db.query(`delete from tickets where raffle_id = any ($1::uuid[])`, [rifas])
    await db.query(`delete from ticket_generation_runs where raffle_id = any ($1::uuid[])`, [rifas])
    await db.query(`delete from raffle_hold_settings where raffle_id = any ($1::uuid[])`, [rifas])
    await db.query(
      `delete from raffle_prize_reward_options where version_id in (
         select id from raffle_prize_versions where raffle_id = any ($1::uuid[]))`,
      [rifas],
    )
    await db.query(
      `delete from raffle_prize_schedule_rules where version_id in (
         select id from raffle_prize_versions where raffle_id = any ($1::uuid[]))`,
      [rifas],
    )
    await db.query(`delete from raffle_prizes where raffle_id = any ($1::uuid[])`, [rifas])
    await db.query(`delete from raffle_prize_versions where raffle_id = any ($1::uuid[])`, [rifas])
    await db.query(
      `update memberships set public_slug = null, public_catalog_enabled = false,
              public_whatsapp_number = null, public_raffle_id = null
        where public_raffle_id = any ($1::uuid[])`,
      [rifas],
    )
    await db.query(`delete from clients where name like $1`, [`${PREFIJO} %`])
    await db.query(`delete from raffles where id = any ($1::uuid[])`, [rifas])
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
  ;[owner, admin, seller1, seller2, otherOrgOwner] = await Promise.all([
    signInAs(USERS.owner),
    signInAs(USERS.admin),
    signInAs(USERS.seller1),
    signInAs(USERS.seller2),
    signInAs(USERS.otherOrgOwner),
  ])
}, 60_000)

afterAll(async () => {
  await limpiar()
  await Promise.all([owner, admin, seller1, seller2, otherOrgOwner].map((c) => c?.auth.signOut()))
  await db.end()
}, 60_000)

// =============================================================================
describe('G1 — las reglas de la base y las de la pantalla son las mismas', () => {
  it('G1-01: las frases de los grupos, letra por letra', async () => {
    const casos: [number, string, number, string | null, number | null][] = [
      [3, 'Mayor', 4, 'Seco', 2],
      [2, '', 4, 'Seco', 2],
      [2, 'Mayor', 4, '', 2],
      [1, 'Mayor', 4, 'Seco', 2],
      [2, 'M', 4, 'Seco', 2],
      [2, 'Ma\nyor', 4, 'Seco', 2],
      [2, 'Mayor', 5, 'Seco', 2],
      [2, 'Mayor', 4, 'MAYOR', 2],
      [1, 'Número', 3, null, null],
      [2, 'Diario', 4, 'Semanal', 4],
    ]
    for (const [count, n1, d1, n2, d2] of casos) {
      const { rows } = await db.query<{ p: string | null }>(
        `select raffle_number_groups_problem($1::smallint, $2, $3::smallint, nullif($4, ''), $5::smallint) as p`,
        [count, n1, d1, n2, d2],
      )
      const ts = numberGroupsProblem({
        count,
        firstName: n1,
        firstDigits: d1,
        secondName: n2 === '' ? null : n2,
        secondDigits: d2,
      })
      expect(rows[0]!.p, JSON.stringify([count, n1, d1, n2, d2])).toBe(ts)
    }
    expect(NUMBER_GROUPS_MESSAGES.immutable).toBe(
      'Los números de una rifa no se cambian después de crearla: ni cuántos son, ni sus nombres, ni sus cifras.',
    )
  })

  it('G1-02: las frases de los números de una boleta, letra por letra', async () => {
    const formatos: [RaffleNumberFormat, number, string, number, string | null, number | null][] = [
      [{ groups: [{ slot: 'daily_number', name: 'Número', digits: 3 }] }, 1, 'Número', 3, null, null],
      [
        {
          groups: [
            { slot: 'daily_number', name: 'Mayor', digits: 4 },
            { slot: 'weekly_number', name: 'Seco', digits: 2 },
          ],
        },
        2,
        'Mayor',
        4,
        'Seco',
        2,
      ],
    ]
    const entradas: [string | null, string | null, boolean][] = [
      ['7', null, true],
      ['007', null, true],
      ['0007', null, true],
      ['12345', '1', true],
      ['1a', null, true],
      [null, null, true],
      [null, null, false],
      ['123', '45', true],
      ['5387', '7', true],
      ['5387', '07', true],
      ['5387', '007', true],
      ['5387', null, true],
      ['5387', null, false],
    ]
    for (const [format, count, n1, d1, n2, d2] of formatos) {
      for (const [daily, weekly, complete] of entradas) {
        const { rows } = await db.query<{ p: string | null }>(
          `select ticket_numbers_problem($1::smallint, $2, $3::smallint, $4, $5::smallint, $6, $7, $8) as p`,
          [count, n1, d1, n2, d2, daily, weekly, complete],
        )
        expect(rows[0]!.p, JSON.stringify([count, daily, weekly, complete])).toBe(
          ticketNumbersProblem(format, daily, weekly, complete),
        )
      }
    }
  })

  it('G1-03: las frases del rango de un grupo del generador, letra por letra', async () => {
    const casos: [string, string, number][] = [
      ['', '9', 2],
      ['1a', '9', 2],
      ['00', '100', 2],
      ['9', '1', 3],
      ['0', '5', 4],
    ]
    for (const [from, to, digits] of casos) {
      const { rows } = await db.query<{ p: string | null }>(
        `select ticket_generation_group_range_problem($1, $2, $3::smallint, 'Seco') as p`,
        [from, to, digits],
      )
      const esperado =
        from === '' || to === ''
          ? GROUP_RANGE_MESSAGES.empty('Seco')
          : !/^[0-9]+$/.test(from) || !/^[0-9]+$/.test(to)
            ? GROUP_RANGE_MESSAGES.format('Seco')
            : from.length > digits || to.length > digits
              ? GROUP_RANGE_MESSAGES.tooLong('Seco', digits)
              : Number(from) > Number(to)
                ? GROUP_RANGE_MESSAGES.order('Seco')
                : null
      expect(rows[0]!.p, JSON.stringify([from, to, digits])).toBe(esperado)
    }
  })
})

// =============================================================================
describe('G2 — la estructura se define al crear la rifa y no cambia', () => {
  it('G2-01: el Dueño crea una rifa de un número; el nombre se guarda sin espacios', async () => {
    const { data, error } = await owner
      .from('raffles')
      .insert({
        organization_id: ctx.demoOrg.id,
        name: `${PREFIJO} sesion uno ${stamp}`,
        ticket_price: 120_000,
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        created_by: ctx.ids.owner,
        prize_mode: 'configurable',
        number_group_count: 1,
        first_group_name: '  Número  ',
        first_group_digits: 3,
        second_group_name: null,
        second_group_digits: null,
      })
      .select('number_group_count, first_group_name, first_group_digits, second_group_name')
      .single()
    expect(error).toBeNull()
    expect(data).toEqual({
      number_group_count: 1,
      first_group_name: 'Número',
      first_group_digits: 3,
      second_group_name: null,
    })
  })

  it('G2-02: una configuración que no vale se rechaza con su frase, venga de donde venga', async () => {
    const base = {
      organization_id: ctx.demoOrg.id,
      ticket_price: 120_000,
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      created_by: ctx.ids.owner,
      prize_mode: 'configurable' as const,
    }
    const iguales = await owner.from('raffles').insert({
      ...base,
      name: `${PREFIJO} iguales ${stamp}`,
      number_group_count: 2,
      first_group_name: 'Mayor',
      first_group_digits: 4,
      second_group_name: 'mayor',
      second_group_digits: 2,
    })
    expect(iguales.error?.message).toBe('Los dos números necesitan nombres distintos.')

    const cinco = await owner.from('raffles').insert({
      ...base,
      name: `${PREFIJO} cinco ${stamp}`,
      number_group_count: 1,
      first_group_name: 'Número',
      first_group_digits: 5,
      second_group_name: null,
      second_group_digits: null,
    })
    expect(cinco.error?.message).toBe('Cada número tiene 2, 3 o 4 cifras.')

    // Un grupo y, sin decir nada del segundo, los valores por omisión de la rifa
    // de siempre: no se rellena nada a escondidas, se rechaza.
    const sobra = await owner.from('raffles').insert({
      ...base,
      name: `${PREFIJO} sobra ${stamp}`,
      number_group_count: 1,
      first_group_name: 'Número',
      first_group_digits: 3,
    })
    expect(sobra.error?.message).toBe('Con un solo número por boleta no hay segundo número.')
  })

  it('G2-03: ni en borrador, ni con la clave de servicio, ni por SQL se cambia la estructura', async () => {
    const borrador = await nuevaRifa('inmutable', UNO_3, { status: 'draft', modo: 'configurable' })

    const sesion = await owner.from('raffles').update({ first_group_digits: 4 }).eq('id', borrador)
    expect(sesion.error?.message).toBe(NUMBER_GROUPS_MESSAGES.immutable)

    const servicio = await ctx.svc
      .from('raffles')
      .update({ number_group_count: 2, second_group_name: 'Otro', second_group_digits: 2 })
      .eq('id', borrador)
    expect(servicio.error?.message).toBe(NUMBER_GROUPS_MESSAGES.immutable)

    expect(await rechazo(`update raffles set first_group_name = 'Otro' where id = $1`, [borrador])).toBe(
      NUMBER_GROUPS_MESSAGES.immutable,
    )

    // Lo demás de la rifa se sigue editando: su nombre y su precio.
    const otros = await owner
      .from('raffles')
      .update({ name: `${PREFIJO} inmutable renombrada ${stamp}`, ticket_price: 125_000 })
      .eq('id', borrador)
    expect(otros.error).toBeNull()
    const { rows } = await db.query(
      `select number_group_count, first_group_name, first_group_digits from raffles where id = $1`,
      [borrador],
    )
    expect(rows[0]).toEqual({ number_group_count: 1, first_group_name: 'Número', first_group_digits: 3 })
  })

  it('G2-04: crear una boleta sube el contador de la rifa sin tocar su estructura', async () => {
    const rifa = await nuevaRifa('contador', UNO_3)
    await boletaPg(rifa, '001', null)
    const { rows } = await db.query(`select ticket_counter::int, number_group_count from raffles where id = $1`, [rifa])
    expect(rows[0]).toEqual({ ticket_counter: 1, number_group_count: 1 })
  })
})

// =============================================================================
describe('G3 — el formato exacto en la base, en todas las combinaciones', () => {
  it('G3-01: uno y dos grupos de 2, 3 y 4 cifras: lo exacto entra, lo demás no, con su frase', async () => {
    const anchos = [2, 3, 4] as const
    for (const d1 of anchos) {
      const rifa = await nuevaRifa(`uno ${d1}`, { count: 1, n1: 'Número', d1 })
      await boletaPg(rifa, '0'.repeat(d1), null)
      expect(
        await rechazo(
          `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number, inventory_status)
           values ($1, $2, $3, $4, $5, 'available')`,
          [ctx.demoOrg.id, rifa, ctx.ids.seller1, ctx.ids.owner, '7'],
        ),
      ).toBe(`El número «Número» lleva exactamente ${d1} cifras: escribe ${'7'.padStart(d1, '0')}.`)
      for (const d2 of anchos) {
        const dos = await nuevaRifa(`dos ${d1}x${d2}`, { count: 2, n1: 'Mayor', d1, n2: 'Seco', d2 })
        await boletaPg(dos, '9'.repeat(d1), '0'.repeat(d2))
        expect(
          await rechazo(
            `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number,
                                  weekly_number, inventory_status)
             values ($1, $2, $3, $4, $5, $6, 'available')`,
            [ctx.demoOrg.id, dos, ctx.ids.seller1, ctx.ids.owner, '9'.repeat(d1), '1'.repeat(d2 + 1)],
          ),
        ).toBe(
          `El número «Seco» lleva exactamente ${d2} cifras, y ${'1'.repeat(d2 + 1)} tiene ${d2 + 1}.`,
        )
      }
    }
  })

  it('G3-02: los ceros de delante forman parte del número, y nada se rellena', async () => {
    const rifa = await nuevaRifa('ceros', MAYOR_SECO)
    await boletaPg(rifa, '0012', '07')
    expect(await numerosDe(rifa)).toEqual(['0012/07'])
    expect(
      await rechazo(
        `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number,
                              weekly_number, inventory_status)
         values ($1, $2, $3, $4, '12', '7', 'available')`,
        [ctx.demoOrg.id, rifa, ctx.ids.seller1, ctx.ids.owner],
      ),
    ).toBe('El número «Mayor» lleva exactamente 4 cifras: escribe 0012.')
  })

  it('G3-03: un grupo que no existe no se escribe: ni número, ni cero, ni texto vacío', async () => {
    const rifa = await nuevaRifa('sin segundo', UNO_3)
    for (const semanal of ['123', '0', '']) {
      expect(
        await rechazo(
          `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number,
                                weekly_number, inventory_status)
           values ($1, $2, $3, $4, '456', $5, 'available')`,
          [ctx.demoOrg.id, rifa, ctx.ids.seller1, ctx.ids.owner, semanal],
        ),
      ).toMatch(/un solo número por boleta|weekly_number_check/)
    }
    const id = await boletaPg(rifa, '456', null)
    const { rows } = await db.query(`select weekly_number, number_group_count from tickets where id = $1`, [id])
    expect(rows[0]).toEqual({ weekly_number: null, number_group_count: 1 })
  })

  it('G3-04: number_group_count lo pone la rifa; escribirlo a mano no cambia nada', async () => {
    const rifa = await nuevaRifa('cuenta', UNO_3)
    const id = await boletaPg(rifa, '111', null)
    await db.query(`update tickets set number_group_count = 2 where id = $1`, [id])
    const { rows } = await db.query(`select number_group_count from tickets where id = $1`, [id])
    expect(rows[0]!.number_group_count).toBe(1)
  })

  it('G3-05: corregir números, crear en lote y aprobar validan contra la rifa', async () => {
    const rifa = await nuevaRifa('vias', UNO_3, { vendedoresCrean: true })

    // Corregir: el personal, por su RPC.
    const id = await boletaPg(rifa, '222', null)
    const mal = await owner.rpc('admin_update_ticket_numbers', {
      p_ticket_id: id,
      p_daily_number: '22',
      p_weekly_number: '',
    })
    expect(mal.error?.message).toBe('El número «Número» lleva exactamente 3 cifras: escribe 022.')
    const bien = await owner.rpc('admin_update_ticket_numbers', {
      p_ticket_id: id,
      p_daily_number: '022',
      p_weekly_number: '',
    })
    expect(bien.error).toBeNull()

    // Crear en lote: la fila mala se nombra; una vacía es un borrador.
    const malLote = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: rifa,
      p_seller_id: ctx.ids.seller1,
      p_rows: [{ daily_number: '300' }, { daily_number: '30' }],
    })
    expect(malLote.error?.message).toBe(
      'Fila 2: El número «Número» lleva exactamente 3 cifras: escribe 030.',
    )
    const lote = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: rifa,
      p_seller_id: ctx.ids.seller1,
      p_rows: [{ daily_number: '300' }, { daily_number: '301' }, { daily_number: '' }, { daily_number: '022' }],
    })
    expect(lote.error).toBeNull()
    expect(lote.data).toMatchObject({
      requested: 4,
      inserted: 3,
      conflicts: [{ daily_number: '022', weekly_number: null }],
    })
    const { rows } = await db.query<{ estado: string; n: number }>(
      `select inventory_status::text as estado, count(*)::int as n from tickets
        where raffle_id = $1 group by 1 order by 1`,
      [rifa],
    )
    expect(rows).toEqual([
      { estado: 'available', n: 3 },
      { estado: 'draft', n: 1 },
    ])

    // El vendedor crea por PostgREST: la regla es la misma, con su frase.
    const vendedorMal = await seller1.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: rifa,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.seller1,
      daily_number: '4',
      inventory_status: 'pending_approval',
    })
    expect(vendedorMal.error?.message).toBe('El número «Número» lleva exactamente 3 cifras: escribe 004.')
    const vendedorBien = await seller1
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: rifa,
        seller_id: ctx.ids.seller1,
        created_by: ctx.ids.seller1,
        daily_number: '004',
        inventory_status: 'pending_approval',
      })
      .select('id')
      .single()
    expect(vendedorBien.error).toBeNull()

    const aprobada = await owner.rpc('approve_tickets', { p_ticket_ids: [vendedorBien.data!.id] })
    expect(aprobada.error).toBeNull()

    // ¿Qué hay tomado? Con un número, el número solo.
    const tomadas = await seller1.rpc('taken_ticket_combinations', {
      p_raffle_id: rifa,
      p_combos: [
        { daily_number: '004', weekly_number: '' },
        { daily_number: '999', weekly_number: '' },
      ],
    })
    expect(tomadas.data).toEqual([{ daily_number: '004', weekly_number: null }])
  })
})

// =============================================================================
describe('G4 — la unicidad, con uno y con dos números', () => {
  it('G4-01: con un número no se repite —aunque el segundo sea nulo— y la frase lo dice', async () => {
    const rifa = await nuevaRifa('unico uno', UNO_3)
    await boletaPg(rifa, '777', null)
    expect(
      await rechazo(
        `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number, inventory_status)
         values ($1, $2, $3, $4, '777', 'available')`,
        [ctx.demoOrg.id, rifa, ctx.ids.seller2, ctx.ids.owner],
      ),
    ).toMatch(/tickets_single_group_unique/)
    const sesion = await owner.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: rifa,
      seller_id: ctx.ids.seller2,
      created_by: ctx.ids.owner,
      daily_number: '777',
      inventory_status: 'available',
    })
    expect(sesion.error?.message).toMatch(/tickets_single_group_unique/)
    // Varios borradores sin número sí conviven: no tienen número que repetir.
    await boletaPg(rifa, null, null, 'draft')
    await boletaPg(rifa, null, null, 'draft')
    // Y el mismo número en OTRA rifa de un número sí cabe.
    const otra = await nuevaRifa('unico uno otra', UNO_3)
    await boletaPg(otra, '777', null)
  })

  it('G4-02: dos inserciones a la vez del mismo número: entra una sola', async () => {
    const rifa = await nuevaRifa('paralelo', UNO_3)
    const a = new PgClient({ connectionString: DB_URL })
    const b = new PgClient({ connectionString: DB_URL })
    await Promise.all([a.connect(), b.connect()])
    const sql = `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number, inventory_status)
                 values ($1, $2, $3, $4, '555', 'available')`
    const params = [ctx.demoOrg.id, rifa, ctx.ids.seller1, ctx.ids.owner]
    try {
      await a.query('begin')
      await b.query('begin')
      await a.query(sql, params)
      // B espera el cerrojo de la fila de la rifa (el contador) o el indice.
      const segunda = b.query(sql, params).then(
        () => 'ok',
        (error: Error) => error.message,
      )
      await a.query('commit')
      const resultado = await segunda
      await b.query(resultado === 'ok' ? 'commit' : 'rollback')
      expect(resultado).toMatch(/tickets_single_group_unique/)
    } finally {
      await Promise.all([a.end(), b.end()])
    }
    const { rows } = await db.query(`select count(*)::int as n from tickets where raffle_id = $1`, [rifa])
    expect(rows[0]!.n).toBe(1)
  })

  it('G4-03: con dos, la combinación es única y un número suelto se repite', async () => {
    const rifa = await nuevaRifa('unico dos', MAYOR_SECO)
    await boletaPg(rifa, '1234', '56')
    await boletaPg(rifa, '1234', '57')
    await boletaPg(rifa, '9999', '56')
    expect(
      await rechazo(
        `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number,
                              weekly_number, inventory_status)
         values ($1, $2, $3, $4, '1234', '56', 'available')`,
        [ctx.demoOrg.id, rifa, ctx.ids.seller2, ctx.ids.owner],
      ),
    ).toMatch(/tickets_combo_unique/)
  })

  it('G4-04: una combinación anulada sigue sin reutilizarse', async () => {
    const rifa = await nuevaRifa('anulada', UNO_3)
    const id = await boletaPg(rifa, '808', null)
    await db.query(
      `update tickets set inventory_status = 'cancelled', cancelled_at = now(), cancel_reason = 'Prueba'
        where id = $1`,
      [id],
    )
    expect(
      await rechazo(
        `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number, inventory_status)
         values ($1, $2, $3, $4, '808', 'available')`,
        [ctx.demoOrg.id, rifa, ctx.ids.seller1, ctx.ids.owner],
      ),
    ).toMatch(/tickets_single_group_unique/)
  })
})

// =============================================================================
describe('G5 — el generador toma el ancho de la rifa', () => {
  it('G5-01: un grupo de cuatro cifras, del 0 al 5, crea 0000…0005 sin segundo número', async () => {
    const rifa = await nuevaRifa('gen uno', { count: 1, n1: 'Número', d1: 4 })
    const vista = await owner.rpc('admin_ticket_generation_preview', {
      p_raffle_id: rifa,
      p_daily_from: '0',
      p_daily_to: '5',
      p_weekly_from: '',
      p_weekly_to: '',
    })
    expect(vista.error).toBeNull()
    expect(vista.data![0]).toMatchObject({ total_count: 6, existing_count: 0 })

    const run = await generar(rifa, ['0', '5'])
    expect(run).toMatchObject({
      daily_from: '0000',
      daily_to: '0005',
      weekly_from: null,
      weekly_to: null,
      total_count: 6,
      created_count: 6,
    })
    expect(await numerosDe(rifa)).toEqual(['0000/∅', '0001/∅', '0002/∅', '0003/∅', '0004/∅', '0005/∅'])
    const { rows } = await db.query(
      `select count(*)::int as n from tickets where raffle_id = $1 and seller_id is null
          and number_group_count = 1 and inventory_status = 'available'`,
      [rifa],
    )
    expect(rows[0]!.n).toBe(6)
  })

  it('G5-02: dos grupos con anchos distintos: todas las combinaciones, con sus ceros', async () => {
    const rifa = await nuevaRifa('gen dos', { count: 2, n1: 'Mayor', d1: 3, n2: 'Seco', d2: 2 })
    const run = await generar(rifa, ['7', '8'], ['0', '1'])
    expect(run).toMatchObject({ daily_from: '007', weekly_to: '01', total_count: 4, created_count: 4 })
    expect(await numerosDe(rifa)).toEqual(['007/00', '007/01', '008/00', '008/01'])
  })

  it('G5-03: más cifras que las del grupo se rechazan sin recortar; el tope sigue', async () => {
    const rifa = await nuevaRifa('gen tope', { count: 2, n1: 'Mayor', d1: 4, n2: 'Seco', d2: 2 })
    const largo = await empezar(rifa, ['0', '5'], ['0', '100'])
    expect(largo.error?.message).toBe(
      'El número «Seco» tiene 2 cifras: su rango va como mucho del 00 al 99.',
    )
    const cinco = await empezar(rifa, ['00005', '00009'], ['0', '1'])
    expect(cinco.error?.message).toBe(
      'El número «Mayor» tiene 4 cifras: su rango va como mucho del 0000 al 9999.',
    )
    const demasiadas = await empezar(rifa, ['0', '9999'], ['0', '10'])
    expect(demasiadas.error?.message).toBe(
      'Esos rangos dan 110.000 combinaciones. El generador crea hasta 100.000 de una vez: acorta uno de los dos rangos.',
    )
  })

  it('G5-04: continuación, solicitud repetida, bloque repetido y lo que ya existía', async () => {
    const rifa = await nuevaRifa('gen continua', { count: 1, n1: 'Número', d1: 4 })
    await boletaPg(rifa, '0003', null)
    const requestId = crypto.randomUUID()
    const inicio = await empezar(rifa, ['0', '9999'], ['', ''], requestId)
    expect(inicio.error).toBeNull()
    const run = inicio.data![0] as Run
    expect(run).toMatchObject({ outcome: 'created', total_count: 10_000, daily_from: '0000' })

    // Un bloque y se corta.
    const primero = await bloque(run)
    expect(primero).toMatchObject({ processed_count: 5000, status: 'in_progress' })

    // La misma solicitud, otra vez: la misma generación (los extremos con ceros
    // o sin ellos son los mismos).
    const misma = await empezar(rifa, ['0000', '9999'], ['', ''], requestId)
    expect(misma.data![0]).toMatchObject({ outcome: 'existing_request', run_id: run.run_id })
    // Otra solicitud igual: se continúa, no se duplica.
    const otra = await empezar(rifa, ['0', '9999'])
    expect(otra.data![0]).toMatchObject({ outcome: 'resumed', run_id: run.run_id, processed_count: 5000 })
    // Un bloque repetido no crea nada.
    const repetido = await bloque({ ...primero, processed_count: 0 })
    expect(repetido).toMatchObject({ outcome: 'already_processed', processed_count: 5000 })

    const fin = await bloque(primero)
    expect(fin).toMatchObject({
      status: 'completed',
      created_count: 9_999,
      existing_count: 1,
    })
    const { rows } = await db.query(
      `select count(*)::int as n, count(distinct daily_number)::int as d from tickets where raffle_id = $1`,
      [rifa],
    )
    expect(rows[0]).toEqual({ n: 10_000, d: 10_000 })

    const existentes = await owner.rpc('admin_ticket_generation_existing', { p_run_id: run.run_id })
    expect(existentes.data).toEqual([
      expect.objectContaining({ daily_number: '0003', weekly_number: null, other_generation: false }),
    ])
  }, 60_000)

  it('G5-05: nada más generar, un lote de 1.000 se entrega a un vendedor (D-260)', async () => {
    const rifa = await nuevaRifa('gen lote', { count: 1, n1: 'Número', d1: 4 })
    await generar(rifa, ['0', '1999'])
    const { rows } = await db.query<{ id: string }>(
      `select id from tickets where raffle_id = $1 order by daily_number limit 1000`,
      [rifa],
    )
    const inicio = performance.now()
    const lote = await owner.rpc('admin_assign_inventory_tickets', {
      p_ticket_ids: rows.map((r) => r.id),
      p_seller_id: ctx.ids.seller1,
    })
    expect(lote.error).toBeNull()
    expect(performance.now() - inicio).toBeLessThan(8_000)
    const { rows: suyas } = await db.query(
      `select count(*)::int as n from tickets where raffle_id = $1 and seller_id = $2`,
      [rifa, ctx.ids.seller1],
    )
    expect(suyas[0]!.n).toBe(1000)
  }, 60_000)
})

// =============================================================================
describe('G6 — vender, apartar y liberar una boleta de un solo número', () => {
  it('G6-01: entregada en lote, se vende; apartada, se vende y al liberarla vuelve al inventario', async () => {
    const rifa = await nuevaRifa('vender', UNO_3)
    await generar(rifa, ['100', '102'])
    const cliente = await nuevoCliente('comprador')

    const entregada = await idDe(rifa, '100', null)
    expect(
      (await owner.rpc('admin_assign_inventory_tickets', { p_ticket_ids: [entregada], p_seller_id: ctx.ids.seller1 }))
        .error,
    ).toBeNull()
    expect((await seller1.rpc('assign_ticket', { p_ticket_id: entregada, p_client_id: cliente })).error).toBeNull()

    const libre = await idDe(rifa, '101', null)
    const apartado = await seller1.rpc('take_ticket_hold', {
      p_ticket_id: libre,
      p_request_id: crypto.randomUUID(),
    })
    expect(apartado.error).toBeNull()
    expect(apartado.data![0]).toMatchObject({ daily_number: '101', weekly_number: null })
    const venta = await seller1.rpc('sell_ticket_hold', {
      p_hold_id: apartado.data![0]!.hold_id,
      p_client_id: cliente,
    })
    expect(venta.error).toBeNull()

    const liberada = await seller1.rpc('release_ticket_client', {
      p_ticket_id: libre,
      p_expected_client_id: cliente,
      p_reason: 'El cliente ya no la quiere',
    })
    expect(liberada.error).toBeNull()
    const { rows } = await db.query(
      `select seller_id, client_id, inventory_status::text as estado, daily_number, weekly_number
         from tickets where id = $1`,
      [libre],
    )
    expect(rows[0]).toEqual({
      seller_id: null,
      client_id: null,
      estado: 'available',
      daily_number: '101',
      weekly_number: null,
    })
  })
})

// =============================================================================
describe('G7 — lo que ya existía fuera de formato no se toca, pero no entra en una venta', () => {
  it('G7-01: se lee y se gestiona; no se aprueba ni se vende, y la frase dice cuál y por qué', async () => {
    const rifa = await nuevaRifa('heredadas', { count: 2, n1: 'Diario', d1: 4, n2: 'Semanal', d2: 4 })
    const disponible = await boletaHeredada(rifa, '007', '1003', 'available')
    const pendiente = await boletaHeredada(rifa, '0000', '00', 'pending_approval')
    const cliente = await nuevoCliente('heredada')

    const venta = await seller1.rpc('assign_ticket', { p_ticket_id: disponible, p_client_id: cliente })
    expect(venta.error?.message).toBe(
      'La boleta 007 / 1003 no tiene el formato de esta rifa. El número «Diario» lleva exactamente 4 cifras: escribe 0007. Hasta que se corrijan sus números, no se puede aprobar ni vender.',
    )
    const aprobacion = await owner.rpc('approve_tickets', { p_ticket_ids: [pendiente] })
    expect(aprobacion.error?.message).toBe(
      'La boleta 0000 / 00 no tiene el formato de esta rifa. El número «Semanal» lleva exactamente 4 cifras: escribe 0000. Hasta que se corrijan sus números, no se puede aprobar ni vender.',
    )

    // Sus números no se cambiaron.
    const { rows } = await db.query(
      `select daily_number, weekly_number, inventory_status::text as estado from tickets
        where id = any ($1::uuid[]) order by daily_number`,
      [[disponible, pendiente]],
    )
    expect(rows).toEqual([
      { daily_number: '0000', weekly_number: '00', estado: 'pending_approval' },
      { daily_number: '007', weekly_number: '1003', estado: 'available' },
    ])

    // El personal las ve en su lista, con la lista blanca; el vendedor, ninguna.
    const lista = await owner.rpc('admin_raffle_nonconforming_tickets', { p_raffle_id: rifa })
    expect(lista.error).toBeNull()
    expect(lista.data!.map((r) => [r.daily_number, r.weekly_number, Number(r.total_count)])).toEqual([
      ['007', '1003', 2],
      ['0000', '00', 2],
    ])
    expect(Object.keys(lista.data![0]!).sort()).toEqual(
      ['daily_number', 'internal_code', 'inventory_status', 'problem', 'ticket_id', 'total_count', 'weekly_number'].sort(),
    )
    const vendedor = await seller1.rpc('admin_raffle_nonconforming_tickets', { p_raffle_id: rifa })
    expect(vendedor.data ?? []).toEqual([])

    // Corregir sus números es la salida, y queda en la bitácora.
    const corregida = await owner.rpc('admin_update_ticket_numbers', {
      p_ticket_id: disponible,
      p_daily_number: '0007',
      p_weekly_number: '1003',
    })
    expect(corregida.error).toBeNull()
    const { rows: bitacora } = await db.query(
      `select old_values ->> 'daily_number' as antes, new_values ->> 'daily_number' as despues
         from audit_logs where entity_id = $1 and action = 'ticket.update'
        order by created_at desc limit 1`,
      [disponible],
    )
    expect(bitacora[0]).toEqual({ antes: '007', despues: '0007' })
    expect((await seller1.rpc('assign_ticket', { p_ticket_id: disponible, p_client_id: cliente })).error).toBeNull()
  })

  it('G7-02: una vendida fuera de formato se sigue gestionando: el paz y salvo, por ejemplo', async () => {
    const rifa = await nuevaRifa('heredada vendida', { count: 2, n1: 'Diario', d1: 4, n2: 'Semanal', d2: 4 })
    const cliente = await nuevoCliente('heredada vendida')
    const id = await boletaHeredada(rifa, '7', '1004', 'available')
    await enTransaccion(async () => {
      await db.query(`set local session_replication_role = replica`)
      await db.query(
        `update tickets set client_id = $2, inventory_status = 'assigned', sale_price = 120000,
                base_price = 120000, sale_date = '2026-01-02', assigned_at = now() where id = $1`,
        [id, cliente],
      )
    })
    const paz = await seller1.rpc('set_ticket_clearance_delivery', { p_ticket_id: id, p_delivered: true })
    expect(paz.error).toBeNull()
  })

  // D-262: la publicación puede encontrar boletas vendidas fuera de formato —el código
  // servido aceptaba de 1 a 4 cifras—. Lo único que la 0084 les cierra es volver a
  // venderse; el dinero y las correcciones siguen como en cualquier boleta vendida.
  it('G7-03: una vendida fuera de formato recibe abonos, se corrige, se anula, cambia de cliente y se libera', async () => {
    const rifa = await nuevaRifa('heredadas vendidas', { count: 2, n1: 'Diario', d1: 4, n2: 'Semanal', d2: 4 })
    const ana = await nuevoCliente('heredada con abonos')
    const beto = await nuevoCliente('heredada sin abonos')
    const vendida = async (diario: string, semanal: string, cliente: string) => {
      const id = await boletaHeredada(rifa, diario, semanal, 'available')
      await enTransaccion(async () => {
        await db.query(`set local session_replication_role = replica`)
        await db.query(
          `update tickets set client_id = $2, inventory_status = 'assigned', sale_price = 120000,
                  base_price = 120000, sale_date = '2026-01-02', assigned_at = now() where id = $1`,
          [id, cliente],
        )
      })
      return id
    }
    const conAbonos = await vendida('8', '1006', ana)
    const sinAbonos = await vendida('9', '1007', beto)

    const pago = await seller1.rpc('create_payment', {
      p_client_id: ana,
      p_total_amount: 30_000,
      p_allocations: [{ ticket_id: conAbonos, amount: 30_000 }],
    })
    expect(pago.error).toBeNull()
    const pagoId = pago.data as string
    const correccion = await seller1.rpc('update_payment_allocation', {
      p_payment_id: pagoId,
      p_ticket_id: conAbonos,
      p_amount: 20_000,
      p_expected_amount: 30_000,
    })
    expect(correccion.error).toBeNull()
    await voidPaymentAs(ctx.ids.owner, pagoId, 'Ensayo de una boleta heredada')

    const cambio = await seller1.rpc('reassign_ticket_client', {
      p_ticket_id: sinAbonos,
      p_expected_client_id: beto,
      p_new_client_id: ana,
      p_reason: 'Ensayo de una boleta heredada',
    })
    expect(cambio.error).toBeNull()
    const liberada = await seller1.rpc('release_ticket_client', {
      p_ticket_id: sinAbonos,
      p_expected_client_id: ana,
      p_reason: 'Ensayo de una boleta heredada',
    })
    expect(liberada.error).toBeNull()

    // Ningún número cambió; la liberada vuelve a estar disponible y no se vende hasta corregirla.
    const { rows } = await db.query(
      `select daily_number, weekly_number, inventory_status::text as estado, paid_amount::int as abonado
         from tickets where id = any ($1::uuid[]) order by daily_number`,
      [[conAbonos, sinAbonos]],
    )
    expect(rows).toEqual([
      { daily_number: '8', weekly_number: '1006', estado: 'assigned', abonado: 0 },
      { daily_number: '9', weekly_number: '1007', estado: 'available', abonado: 0 },
    ])
    const otraVenta = await seller1.rpc('assign_ticket', { p_ticket_id: sinAbonos, p_client_id: beto })
    expect(otraVenta.error?.message).toMatch(/^La boleta 9 \/ 1007 no tiene el formato de esta rifa\./)
  })
})

// =============================================================================
describe('G8 — el catálogo público dice cómo se llaman los números', () => {
  it('G8-01: la proyección pública trae los grupos de la rifa publicada, y nada más nuevo', async () => {
    const rifa = await nuevaRifa('catalogo', UNO_3)
    const slug = `d261-catalogo-${stamp}`
    await db.query(
      `update memberships set public_slug = $1, public_catalog_enabled = true,
              public_whatsapp_number = '573001112233', public_raffle_id = $2
        where profile_id = $3 and organization_id = $4`,
      [slug, rifa, ctx.ids.seller2, ctx.demoOrg.id],
    )
    await db.query(
      `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number, inventory_status)
       values ($1, $2, $3, $4, '042', 'available')`,
      [ctx.demoOrg.id, rifa, ctx.ids.seller2, ctx.ids.owner],
    )
    const vendedor = await ctx.svc.rpc('public_catalog_seller', { p_slug: slug })
    expect(vendedor.error).toBeNull()
    expect(vendedor.data![0]).toMatchObject({
      number_group_count: 1,
      first_group_name: 'Número',
      first_group_digits: 3,
      second_group_name: null,
      second_group_digits: null,
      available_count: 1,
    })
    const boletas = await ctx.svc.rpc('public_catalog_tickets', { p_slug: slug })
    expect(boletas.data).toEqual([{ daily_number: '042', weekly_number: null }])
    // Sigue siendo solo del servidor.
    const anonimo = await (await signInAs(USERS.seller1)).rpc('public_catalog_seller', { p_slug: slug })
    expect(anonimo.error).not.toBeNull()
  })
})

// =============================================================================
describe('G9 — premios: el grupo que usan y cuántas cifras comparan', () => {
  it('G9-01: un premio no usa un número que la rifa no tiene ni compara más cifras de las suyas', async () => {
    const rifa = await nuevaRifa('premio grupos', UNO_3, {
      status: 'draft',
      modo: 'configurable',
      desde: '2084-01-01',
      hasta: '2084-12-31',
    })
    const regla = [
      { start_date: '2084-03-06', end_date: '2084-03-06', weekdays: [1], lottery_mode: 'corresponding', lottery_code: null },
    ]
    const crear = (campo: 'daily_number' | 'weekly_number', cifras: 'four' | 'last_three' | 'last_two', titulo: string) =>
      owner.rpc('create_raffle_prize', {
        p_raffle_id: rifa,
        p_title: titulo,
        p_category: 'daily',
        p_reward_mode: 'fixed',
        p_reward_options: [{ description: null, amount: 100_000 }],
        p_number_field: campo,
        p_digits: cifras,
        p_rules: regla,
      })
    expect((await crear('weekly_number', 'last_two', 'Sin segundo')).error?.message).toBe(
      'El premio «Sin segundo» juega con un número que esta rifa no tiene. Elige «Número».',
    )
    expect((await crear('daily_number', 'four', 'Cuatro')).error?.message).toBe(
      'El premio «Cuatro» compara 4 cifras, pero el número «Número» tiene 3. Elige menos cifras.',
    )
    expect((await crear('daily_number', 'last_three', 'Tres')).error).toBeNull()
    expect((await crear('daily_number', 'last_two', 'Dos')).error).toBeNull()
    // El mismo grupo y las mismas cifras el mismo día: el conflicto de siempre.
    expect((await crear('daily_number', 'last_two', 'Dos otra vez')).error?.message).toMatch(
      /juegan el 06\/03\/2084 con el mismo número de la boleta, las mismas cifras y la misma lotería/,
    )
  })
})

// =============================================================================
describe('G10 — el motor: dos cifras con sus ceros y 4 > 3 > 2', () => {
  type Loteria = 'cundinamarca' | 'cruz_roja' | 'meta' | 'bogota' | 'medellin' | 'boyaca'

  async function sorteo(loteria: Loteria, fecha: string, ganador: string): Promise<string> {
    secuencia += 1
    const oficial = `${fecha}T22:30:00-05:00`
    const { rows } = await db.query<{ id: string }>(
      `insert into lottery_draw_schedules (lottery_code, draw_number, reference_date,
                                           original_scheduled_at, official_scheduled_at, schedule_status)
       values ($1, $2, $3, $4, $4, 'scheduled') returning id`,
      [loteria, `D261-${stamp}-${secuencia}`, fecha, oficial],
    )
    const { rows: resultado } = await db.query<{ id: string }>(
      `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
       values ($1, $2, 'confirmed', 'official_page', now()) returning id`,
      [rows[0]!.id, ganador],
    )
    return resultado[0]!.id
  }

  /** Una rifa configurable con sus premios ya publicados, activa. */
  async function rifaConPremios(
    nombre: string,
    grupos: Grupos,
    fecha: string,
    premios: { titulo: string; campo: 'daily_number' | 'weekly_number'; cifras: 'four' | 'last_three' | 'last_two' }[],
  ): Promise<{ rifa: string; premios: Record<string, string> }> {
    const rifa = await nuevaRifa(nombre, grupos, {
      status: 'draft',
      modo: 'configurable',
      desde: '2084-01-01',
      hasta: '2084-12-31',
    })
    const ids: Record<string, string> = {}
    const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay()
    for (const p of premios) {
      const { data, error } = await owner.rpc('create_raffle_prize', {
        p_raffle_id: rifa,
        p_title: p.titulo,
        p_category: 'daily',
        p_reward_mode: 'fixed',
        p_reward_options: [{ description: null, amount: 100_000 }],
        p_number_field: p.campo,
        p_digits: p.cifras,
        p_rules: [
          { start_date: fecha, end_date: fecha, weekdays: [dia === 0 ? 7 : dia], lottery_mode: 'corresponding', lottery_code: null },
        ],
      })
      if (error) throw new Error(`Premio ${p.titulo}: ${error.message}`)
      ids[p.titulo] = (data as unknown as { prize_id: string }[])[0]!.prize_id
    }
    await db.query(`update raffles set status = 'active' where id = $1`, [rifa])
    return { rifa, premios: ids }
  }

  /** Boleta vendida (o no) antes del sorteo, por `pg`. */
  async function boleta(rifa: string, diario: string, semanal: string | null, cliente?: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number, weekly_number,
                            inventory_status, created_at)
       values ($1, $2, $3, $4, $5, $6, 'available', '2084-01-02T08:00:00-05:00') returning id`,
      [ctx.demoOrg.id, rifa, ctx.ids.seller1, ctx.ids.owner, diario, semanal],
    )
    const id = rows[0]!.id
    if (cliente) {
      await db.query(
        `update tickets set client_id = $2, inventory_status = 'assigned', sale_price = 120000,
                base_price = 120000, sale_date = '2084-01-02', assigned_at = '2084-01-03T08:00:00-05:00'
          where id = $1`,
        [id, cliente],
      )
    }
    return id
  }

  async function enlaces(resultId: string): Promise<string[]> {
    const { rows } = await db.query<{ e: string }>(
      `select m.ticket_id || ':' || coalesce(l.prize_id::text, '-') || ':' || m.matched_number as e
         from lottery_ticket_matches m
         left join lottery_ticket_match_prizes l on l.match_id = m.id
        where m.result_id = $1
        order by 1`,
      [resultId],
    )
    return rows.map((r) => r.e)
  }

  it('G10-01: las dos últimas cifras comparan texto exacto: con 5307, 07 sí y 7 no', async () => {
    const fecha = '2084-03-06' // lunes: Cundinamarca
    const { rifa, premios } = await rifaConPremios('motor dos', MAYOR_SECO, fecha, [
      { titulo: 'Seco', campo: 'weekly_number', cifras: 'last_two' },
    ])
    const ana = await nuevoCliente('motor ana')
    const conCero = await boleta(rifa, '1111', '07', ana)
    await boleta(rifa, '2222', '70', ana)
    const resultado = await sorteo('cundinamarca', fecha, '5307')
    const { error } = await runLotteryEngine(resultado)
    expect(error).toBeNull()
    expect(await enlaces(resultado)).toEqual([`${conCero}:${premios.Seco}:07`])
  })

  it('G10-02: 4 > 3 > 2 entre los grupos y las boletas de un mismo cliente, y no cruza clientes', async () => {
    const fecha = '2084-03-07' // martes: Cruz Roja
    const { rifa, premios } = await rifaConPremios('motor prioridad', MAYOR_SECO, fecha, [
      { titulo: 'Cuatro', campo: 'daily_number', cifras: 'four' },
      { titulo: 'Tres', campo: 'daily_number', cifras: 'last_three' },
      { titulo: 'Dos', campo: 'weekly_number', cifras: 'last_two' },
    ])
    const [a, b, c] = await Promise.all([
      nuevoCliente('motor a'),
      nuevoCliente('motor b'),
      nuevoCliente('motor c'),
    ])
    // A: cuatro en una boleta y dos en otra → solo el de cuatro.
    const a4 = await boleta(rifa, '5387', '11', a)
    await boleta(rifa, '0000', '87', a)
    // B: tres en una boleta y dos en el otro número de la misma → solo el de tres.
    const b3 = await boleta(rifa, '1387', '87', b)
    // C: solo dos → el de dos.
    const c2 = await boleta(rifa, '2222', '87', c)
    // Sin cliente: es su propia unidad.
    const libre = await boleta(rifa, '3333', '87')

    const resultado = await sorteo('cruz_roja', fecha, '5387')
    const { error } = await runLotteryEngine(resultado)
    expect(error).toBeNull()
    expect(await enlaces(resultado)).toEqual(
      [
        `${a4}:${premios.Cuatro}:5387`,
        `${b3}:${premios.Tres}:1387`,
        `${c2}:${premios.Dos}:87`,
        `${libre}:${premios.Dos}:87`,
      ].sort(),
    )
  })

  it('G10-03: entre aciertos de la misma cantidad máxima no se elige: se quedan todos', async () => {
    const fecha = '2084-03-08' // miércoles: Meta
    const { rifa, premios } = await rifaConPremios('motor empate', MAYOR_SECO, fecha, [
      { titulo: 'Tres', campo: 'daily_number', cifras: 'last_three' },
      { titulo: 'Dos', campo: 'weekly_number', cifras: 'last_two' },
    ])
    const d = await nuevoCliente('motor d')
    const t1 = await boleta(rifa, '1387', '11', d)
    const t2 = await boleta(rifa, '9387', '22', d)
    await boleta(rifa, '0000', '87', d)
    const resultado = await sorteo('meta', fecha, '5387')
    expect((await runLotteryEngine(resultado)).error).toBeNull()
    expect(await enlaces(resultado)).toEqual(
      [`${t1}:${premios.Tres}:1387`, `${t2}:${premios.Tres}:9387`].sort(),
    )
  })

  it('G10-04: la prioridad no cruza rifas ni sorteos', async () => {
    const fecha = '2084-03-09' // jueves: Bogotá
    const otraFecha = '2084-03-10' // viernes: Medellín
    const uno = await rifaConPremios('motor rifa uno', MAYOR_SECO, fecha, [
      { titulo: 'Cuatro', campo: 'daily_number', cifras: 'four' },
    ])
    const dos = await rifaConPremios('motor rifa dos', MAYOR_SECO, fecha, [
      { titulo: 'Dos', campo: 'weekly_number', cifras: 'last_two' },
    ])
    const tres = await rifaConPremios('motor otro sorteo', MAYOR_SECO, otraFecha, [
      { titulo: 'Dos', campo: 'weekly_number', cifras: 'last_two' },
    ])
    const e = await nuevoCliente('motor e')
    const enUno = await boleta(uno.rifa, '5387', '11', e)
    const enDos = await boleta(dos.rifa, '1111', '87', e)
    const enTres = await boleta(tres.rifa, '2222', '87', e)

    const primero = await sorteo('bogota', fecha, '5387')
    expect((await runLotteryEngine(primero)).error).toBeNull()
    expect(await enlaces(primero)).toEqual(
      [`${enUno}:${uno.premios.Cuatro}:5387`, `${enDos}:${dos.premios.Dos}:87`].sort(),
    )
    const segundo = await sorteo('medellin', otraFecha, '1187')
    expect((await runLotteryEngine(segundo)).error).toBeNull()
    expect(await enlaces(segundo)).toEqual([`${enTres}:${tres.premios.Dos}:87`])
  })

  it('G10-05: en una rifa de un solo número de tres cifras, tres manda sobre dos', async () => {
    const fecha = '2084-03-11' // sábado: Boyacá
    const { rifa, premios } = await rifaConPremios('motor uno tres', UNO_3, fecha, [
      { titulo: 'Tres', campo: 'daily_number', cifras: 'last_three' },
      { titulo: 'Dos', campo: 'daily_number', cifras: 'last_two' },
    ])
    const f = await nuevoCliente('motor f')
    const g = await nuevoCliente('motor g')
    const tres = await boleta(rifa, '387', null, f)
    await boleta(rifa, '187', null, f)
    const soloDos = await boleta(rifa, '287', null, g)
    const resultado = await sorteo('boyaca', fecha, '5387')
    expect((await runLotteryEngine(resultado)).error).toBeNull()
    expect(await enlaces(resultado)).toEqual(
      [`${tres}:${premios.Tres}:387`, `${soloDos}:${premios.Dos}:287`].sort(),
    )
  })

  it('G10-06: la defensa de los enlaces no deja conservar menos cifras con más', async () => {
    const fecha = '2084-03-13' // lunes
    const { rifa, premios } = await rifaConPremios('motor defensa', MAYOR_SECO, fecha, [
      { titulo: 'Cuatro', campo: 'daily_number', cifras: 'four' },
      { titulo: 'Dos', campo: 'weekly_number', cifras: 'last_two' },
    ])
    const h = await nuevoCliente('motor h')
    await boleta(rifa, '5387', '11', h)
    const dos = await boleta(rifa, '0000', '87', h)
    const resultado = await sorteo('cundinamarca', fecha, '5387')
    expect((await runLotteryEngine(resultado)).error).toBeNull()
    // Forzar a mano el enlace que la prioridad descartó —coincidencia y premio en
    // la misma sentencia, como exige la 0061—: la base lo rechaza.
    const error = await rechazo(
      `with m as (
         insert into lottery_ticket_matches (result_id, ticket_id, organization_id, raffle_id, seller_id,
                                             client_id, match_field, matched_number, assignment_status,
                                             inventory_status_at_draw, assigned_at, ticket_created_at)
         select $1, t.id, t.organization_id, t.raffle_id, t.seller_id, t.client_id, 'weekly_number',
                t.weekly_number, 'sold', 'assigned', t.assigned_at, t.created_at
           from tickets t where t.id = $2
         returning id, result_id, organization_id, raffle_id, match_field
       )
       insert into lottery_ticket_match_prizes (organization_id, raffle_id, result_id, match_id, match_field,
                                                prize_id, prize_version_id)
       select m.organization_id, m.raffle_id, m.result_id, m.id, m.match_field, p.id, p.current_version_id
         from m cross join raffle_prizes p where p.id = $3`,
      [resultado, dos, premios.Dos],
    )
    expect(error).toBe(
      'Un mismo cliente no puede conservar un premio de menos cifras cuando tiene uno de más cifras en el mismo resultado.',
    )
  })
})

// =============================================================================
describe('G11 — privacidad y aislamiento', () => {
  it('G11-01: otra organización no ve las boletas fuera de formato ni cambia la estructura', async () => {
    const rifa = await nuevaRifa('aislada', UNO_3)
    await boletaHeredada(rifa, '7', null, 'available')
    const lista = await otherOrgOwner.rpc('admin_raffle_nonconforming_tickets', { p_raffle_id: rifa })
    expect(lista.data ?? []).toEqual([])
    const cambio = await otherOrgOwner.from('raffles').update({ first_group_name: 'Otro' }).eq('id', rifa)
    expect(cambio.error).toBeNull() // RLS: cero filas, sin error
    const { rows } = await db.query(`select first_group_name from raffles where id = $1`, [rifa])
    expect(rows[0]!.first_group_name).toBe('Número')
    // El Administrador sí ve las de su organización.
    const suya = await admin.rpc('admin_raffle_nonconforming_tickets', { p_raffle_id: rifa })
    expect(suya.data?.length).toBe(1)
  })

  it('G11-02: ninguna sesión ejecuta las reglas puras ni lee la auditoría de la 0084', async () => {
    const reglas = await seller2.rpc('ticket_numbers_problem' as never, {} as never)
    expect(reglas.error).not.toBeNull()
    const auditoria = await owner.from('raffle_number_format_audits' as never).select('*')
    expect(auditoria.error).not.toBeNull()
    const { rows } = await db.query(
      `select relrowsecurity, relforcerowsecurity from pg_class where relname = 'raffle_number_format_audits'`,
    )
    expect(rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true })
  })
})
