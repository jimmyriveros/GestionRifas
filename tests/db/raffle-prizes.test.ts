/**
 * Premios configurables por rifa, en la base (BR-J01..BR-J14; migración `0058`,
 * D-199 y D-200).
 *
 * Lo que se prueba aquí es lo que la pantalla NO puede garantizar: quién puede
 * escribir, sobre qué rifa, qué estados no pueden existir, qué queda en la
 * bitácora y a quién se le avisa. Cada acto probado inicia sesión como un
 * usuario real y opera con la clave pública (D-043). La service role y
 * PostgreSQL directo solo preparan el escenario, comprueban los CHECK y limpian.
 *
 * LAS RIFAS DE ESTA SUITE SON SUYAS. Se crean con nombre propio y se borran al
 * final; ninguna prueba toca las del seed, porque otras suites cuentan sus
 * boletas (I-035).
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ROLE_DEFAULT_CAPABILITIES, APP_CAPABILITIES } from '@/lib/auth/capabilities'

import {
  anonClient,
  DB_URL,
  loadSeedContext,
  SEED_PASSWORD,
  signInAs,
  USERS,
  type Client,
} from './helpers'

type PrizeRulePayload = {
  start_date: string
  end_date: string
  weekdays: number[]
  lottery_mode: 'corresponding' | 'fixed'
  lottery_code: string | null
}

type PrizeResult = { prize_id: string; version_id: string; version_number: number }

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let db: PgClient

let owner: Client
let admin: Client
let seller: Client
let otherOrgOwner: Client

/** Rifa en borrador y rifa activa, las dos en modo configurable. */
let draftRaffle: string
let activeRaffle: string
let legacyRaffle: string

const createdRaffles: string[] = []
const createdProfiles: string[] = []
const createdSchedules: string[] = []

/** Días de la semana ISO de una fecha 'AAAA-MM-DD'. */
function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const utc = new Date(Date.UTC(y!, m! - 1, d!, 12))
  return utc.getUTCDay() === 0 ? 7 : utc.getUTCDay()
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const utc = new Date(Date.UTC(y!, m! - 1, d! + days, 12))
  return utc.toISOString().slice(0, 10)
}

/** El lunes de la semana de una fecha. */
function monday(date: string): string {
  return addDays(date, -(isoWeekday(date) - 1))
}

let today: string
/** Lunes de una semana que todavía no empieza: nada de ahí se pudo jugar. */
let futureMonday: string
/** Lunes de una semana ya pasada: ahí sí hace falta conocer el corte. */
let pastMonday: string

function rule(overrides: Partial<PrizeRulePayload> = {}): PrizeRulePayload {
  return {
    start_date: futureMonday,
    end_date: addDays(futureMonday, 4),
    weekdays: [1, 2, 3, 4, 5],
    lottery_mode: 'corresponding',
    lottery_code: null,
    ...overrides,
  }
}

/**
 * Cada premio de esta suite vale un peso más que el anterior.
 *
 * NO es un adorno: BR-J08 rechaza dos premios vigentes con las MISMAS
 * condiciones y la misma recompensa, y el nombre no cuenta a propósito. Sin esto
 * el segundo premio de cada rifa chocaría con el primero — que es justo lo que
 * comprueba J7-01, con dos importes iguales puestos a mano.
 */
let siguienteImporte = 500000

async function createPrize(
  client: Client,
  raffleId: string,
  overrides: Record<string, unknown> = {},
) {
  siguienteImporte += 1000
  return client.rpc('create_raffle_prize', {
    p_raffle_id: raffleId,
    p_title: 'Premio diario',
    p_category: 'daily',
    p_reward_type: 'cash',
    p_number_field: 'daily_number',
    p_rules: [rule()],
    p_reward_amount: siguienteImporte,
    ...overrides,
  })
}

async function prizeOf(client: Client, raffleId: string, overrides: Record<string, unknown> = {}) {
  const { data, error } = await createPrize(client, raffleId, overrides)
  if (error) throw new Error(`No se pudo crear el premio: ${error.message}`)
  return (data as unknown as PrizeResult[])[0]!
}

/** Una rifa de esta suite, creada sin sesión: el modo no se elige desde la aplicación. */
async function newRaffle(
  name: string,
  options: { mode?: 'legacy' | 'configurable'; start?: string; end?: string } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into raffles (organization_id, name, ticket_price, start_date, end_date, created_by, prize_mode)
     values ($1, $2, 120000, $3, $4, $5, $6)
     returning id`,
    [
      ctx.demoOrg.id,
      name,
      options.start ?? pastMonday,
      options.end ?? addDays(futureMonday, 60),
      ctx.ids.owner,
      options.mode ?? 'configurable',
    ],
  )
  createdRaffles.push(rows[0]!.id)
  return rows[0]!.id
}

async function countAudit(prizeId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from audit_logs where entity_type = 'raffle_prize' and entity_id = $1`,
    [prizeId],
  )
  return rows[0]!.n
}

async function notificationsOf(versionId: string) {
  const { rows } = await db.query<{ recipient_profile_id: string; data: Record<string, unknown> }>(
    `select recipient_profile_id, data from notifications
      where kind = 'raffle_prize.changed' and entity_id = $1`,
    [versionId],
  )
  return rows
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  const { rows } = await db.query<{ today: string }>(`select today_bogota()::text as today`)
  today = rows[0]!.today
  futureMonday = addDays(monday(today), 14)
  pastMonday = addDays(monday(today), -21)
  ;[owner, admin, seller, otherOrgOwner] = await Promise.all([
    signInAs(USERS.owner),
    signInAs(USERS.admin),
    signInAs(USERS.seller1),
    signInAs(USERS.otherOrgOwner),
  ])

  const stamp = Date.now().toString(36)
  draftRaffle = await newRaffle(`Premios borrador ${stamp}`)
  activeRaffle = await newRaffle(`Premios activa ${stamp}`)
  legacyRaffle = await newRaffle(`Premios heredada ${stamp}`, { mode: 'legacy' })

  // La rifa activa necesita al menos un premio para poder activarse (BR-J13).
  await prizeOf(owner, activeRaffle, { p_title: 'Premio de la rifa activa' })
  await db.query(`update raffles set status = 'active' where id = $1`, [activeRaffle])
})

afterAll(async () => {
  // Las versiones y sus períodos son inmutables también para la service role, y
  // no hay privilegio de DELETE: la limpieza va por PostgreSQL con los
  // disparadores desactivados, dentro de una transacción.
  await db.query('begin')
  await db.query(`set local session_replication_role = replica`)
  await db.query(
    `delete from notifications where kind = 'raffle_prize.changed'
       and (data ->> 'raffle_id')::uuid = any ($1::uuid[])`,
    [createdRaffles],
  )
  await db.query(
    `delete from audit_logs where entity_type = 'raffle_prize'
       and (coalesce(new_values, old_values) ->> 'raffle_id')::uuid = any ($1::uuid[])`,
    [createdRaffles],
  )
  await db.query(
    `delete from raffle_prize_schedule_rules where version_id in (
       select id from raffle_prize_versions where raffle_id = any ($1::uuid[]))`,
    [createdRaffles],
  )
  await db.query(`delete from raffle_prizes where raffle_id = any ($1::uuid[])`, [createdRaffles])
  await db.query(`delete from raffle_prize_versions where raffle_id = any ($1::uuid[])`, [
    createdRaffles,
  ])
  await db.query(
    `delete from audit_logs where entity_type = 'raffle' and entity_id = any ($1::uuid[])`,
    [createdRaffles],
  )
  await db.query(`delete from raffles where id = any ($1::uuid[])`, [createdRaffles])
  if (createdSchedules.length > 0) {
    await db.query(`delete from lottery_draw_schedules where id = any ($1::uuid[])`, [
      createdSchedules,
    ])
  }
  await db.query('commit')

  for (const profileId of createdProfiles) {
    await db.query('begin')
    await db.query(`set local session_replication_role = replica`)
    await db.query(`delete from memberships where profile_id = $1`, [profileId])
    await db.query('commit')
    await ctx.svc.auth.admin.deleteUser(profileId)
  }

  await db.end()
})

// =============================================================================
describe('J1 — quién puede configurar premios (BR-J10, D-200)', () => {
  it('J1-01: el Dueño crea un premio con su versión 1', async () => {
    const premio = await prizeOf(owner, draftRaffle, { p_title: 'Premio del dueño' })
    expect(premio.version_number).toBe(1)

    const { rows } = await db.query(
      `select p.status, p.position, p.created_by, v.title, v.digits, v.number_field, v.status as version_status
         from raffle_prizes p join raffle_prize_versions v on v.id = p.current_version_id
        where p.id = $1`,
      [premio.prize_id],
    )
    expect(rows[0]).toMatchObject({
      status: 'active',
      created_by: ctx.ids.owner,
      title: 'Premio del dueño',
      digits: 'four',
      number_field: 'daily_number',
      version_status: 'active',
    })
  })

  it('J1-02: el Administrador también, por la capacidad y no por su rol', async () => {
    const premio = await prizeOf(admin, draftRaffle, { p_title: 'Premio del administrador' })
    const publicado = await admin.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
      p_title: 'Premio del administrador',
      p_category: 'daily',
      p_reward_type: 'cash',
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [rule()],
      p_reward_amount: 600000,
    })
    expect(publicado.error).toBeNull()
    expect((publicado.data as unknown as PrizeResult[])[0]!.version_number).toBe(2)
  })

  it('J1-03: un vendedor no puede crear premios', async () => {
    const { error } = await createPrize(seller, draftRaffle)
    expect(error?.message).toContain('no tienes permiso')
  })

  it('J1-04: un Dueño de otra organización recibe lo mismo que si no existiera', async () => {
    const { error } = await createPrize(otherOrgOwner, draftRaffle)
    expect(error?.message).toContain('La rifa no existe o no tienes permiso')

    const inexistente = await createPrize(owner, '11111111-2222-4333-8444-555555555555')
    expect(inexistente.error?.message).toBe(error?.message)
  })

  it('J1-05: una cuenta desactivada no configura nada (BR-A04)', async () => {
    const email = `premios-admin-${Date.now().toString(36)}@demo.test`
    const { data, error } = await ctx.svc.auth.admin.createUser({
      email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Admin Premios', phone: '3001234567' },
    })
    if (error) throw error
    createdProfiles.push(data.user.id)
    await ctx.svc.auth.admin.updateUserById(data.user.id, { password: SEED_PASSWORD })
    await ctx.svc
      .from('memberships')
      .insert({ organization_id: ctx.demoOrg.id, profile_id: data.user.id, role: 'admin' })

    const temporal = await signInAs(email)
    const antes = await createPrize(temporal, draftRaffle, { p_title: 'Premio de cuenta activa' })
    expect(antes.error).toBeNull()

    await ctx.svc.from('memberships').update({ is_active: false }).eq('profile_id', data.user.id)
    const despues = await createPrize(temporal, draftRaffle, {
      p_title: 'Premio de cuenta inactiva',
    })
    expect(despues.error?.message).toContain('no tienes permiso')
  })

  it('J1-06: la política de capacidades de PostgreSQL es la misma que la de la aplicación', async () => {
    for (const role of ['owner', 'admin', 'seller'] as const) {
      const { rows } = await db.query<{ capabilities: string[] }>(
        `select app_role_default_capabilities($1::app_role) as capabilities`,
        [role],
      )
      expect(rows[0]!.capabilities.sort()).toEqual([...ROLE_DEFAULT_CAPABILITIES[role]].sort())
    }

    const { rows } = await db.query<{ catalog: string[] }>(
      `select app_capability_catalog() as catalog`,
    )
    expect(rows[0]!.catalog.sort()).toEqual([...APP_CAPABILITIES].sort())
  })

  it('J1-07: una capacidad que no existe es «no» hasta para el Dueño', async () => {
    const { rows } = await db.query<{ puede: boolean }>(
      `select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true) is not null
              and has_org_capability($2, 'raffles.prizes.inventada') as puede`,
      [ctx.ids.owner, ctx.demoOrg.id],
    )
    expect(rows[0]!.puede).toBe(false)
  })
})

// =============================================================================
describe('J2 — la rifa manda: modo, estado y fechas (BR-J13)', () => {
  it('J2-01: ninguna sesión puede poner una rifa en modo configurable', async () => {
    const { error } = await owner
      .from('raffles')
      .update({ prize_mode: 'configurable' })
      .eq('id', legacyRaffle)
    expect(error?.message).toContain('no se cambia desde la aplicación')

    const { data } = await ctx.svc
      .from('raffles')
      .select('prize_mode')
      .eq('id', legacyRaffle)
      .single()
    expect(data?.prize_mode).toBe('legacy')
  })

  it('J2-02: una rifa heredada no admite premios', async () => {
    const { error } = await createPrize(owner, legacyRaffle)
    expect(error?.message).toContain('todavía no usa premios configurables')
  })

  it('J2-03: ni la service role cambia el modo de una rifa que ya no está en borrador', async () => {
    await expect(
      db.query(`update raffles set prize_mode = 'legacy' where id = $1`, [activeRaffle]),
    ).rejects.toThrow(/solo se puede cambiar mientras está en borrador/)
  })

  it('J2-04: una rifa con premios no vuelve al sistema de siempre', async () => {
    await expect(
      db.query(`update raffles set prize_mode = 'legacy' where id = $1`, [draftRaffle]),
    ).rejects.toThrow(/ya tiene premios configurados/)
  })

  it('J2-05: una rifa configurable sin premios no se puede activar', async () => {
    const vacia = await newRaffle(`Premios vacia ${Date.now().toString(36)}`)
    await expect(
      db.query(`update raffles set status = 'active' where id = $1`, [vacia]),
    ).rejects.toThrow(/al menos un premio/)
  })

  it('J2-06: acortar las fechas de la rifa no puede dejar un premio fuera', async () => {
    const raffleId = await newRaffle(`Premios fechas ${Date.now().toString(36)}`)
    await prizeOf(owner, raffleId, {
      p_title: 'Premio de diciembre',
      p_rules: [rule({ start_date: futureMonday, end_date: addDays(futureMonday, 4) })],
    })

    await expect(
      db.query(`update raffles set end_date = $2 where id = $1`, [
        raffleId,
        addDays(futureMonday, 1),
      ]),
    ).rejects.toThrow(/fuera de las nuevas fechas de la rifa/)
  })

  it('J2-07: una rifa cerrada ya no se toca', async () => {
    const raffleId = await newRaffle(`Premios cerrada ${Date.now().toString(36)}`)
    const premio = await prizeOf(owner, raffleId, { p_title: 'Premio de rifa cerrada' })
    await db.query(`update raffles set status = 'active' where id = $1`, [raffleId])
    await db.query(`update raffles set status = 'closed' where id = $1`, [raffleId])

    const { error } = await owner.rpc('archive_raffle_prize', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
    })
    expect(error?.message).toContain('cerrada o anulada')
  })
})

// =============================================================================
describe('J3 — el calendario, en la base (BR-J04, BR-J05)', () => {
  it('J3-01: el domingo se rechaza', async () => {
    const domingo = addDays(futureMonday, 6)
    const { error } = await createPrize(owner, draftRaffle, {
      p_title: 'Premio del domingo',
      p_rules: [rule({ start_date: domingo, end_date: domingo, weekdays: [7] })],
    })
    expect(error?.message).toContain('El domingo no tiene lotería')
  })

  it('J3-02: una lotería fija fuera de su día se rechaza', async () => {
    const { error } = await createPrize(owner, draftRaffle, {
      p_title: 'Premio de lotería fija mal puesta',
      p_rules: [
        rule({
          start_date: futureMonday,
          end_date: futureMonday,
          weekdays: [1],
          lottery_mode: 'fixed',
          lottery_code: 'boyaca',
        }),
      ],
    })
    expect(error?.message).toContain('solo juega los sábados')
  })

  it('J3-03: número SEMANAL un lunes con Cundinamarca es válido (el caso de la excepción)', async () => {
    const premio = await prizeOf(owner, draftRaffle, {
      p_title: 'Premio semanal del lunes',
      p_category: 'special',
      p_number_field: 'weekly_number',
      p_rules: [
        rule({
          start_date: futureMonday,
          end_date: futureMonday,
          weekdays: [1],
          lottery_mode: 'fixed',
          lottery_code: 'cundinamarca',
        }),
      ],
      p_reward_amount: 1000000,
    })

    const { rows } = await db.query<{ reference_date: string; lottery_code: string }>(
      `select reference_date::text, lottery_code::text from raffle_prize_rule_dates($1)`,
      [premio.version_id],
    )
    expect(rows).toEqual([{ reference_date: futureMonday, lottery_code: 'cundinamarca' }])
  })

  it('J3-04: varias ventanas separadas son un solo premio', async () => {
    const premio = await prizeOf(owner, draftRaffle, {
      p_title: 'Premio de dos ventanas',
      p_rules: [
        rule({ start_date: futureMonday, end_date: addDays(futureMonday, 4) }),
        rule({ start_date: addDays(futureMonday, 14), end_date: addDays(futureMonday, 18) }),
      ],
    })

    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from raffle_prize_rule_dates($1)`,
      [premio.version_id],
    )
    expect(rows[0]!.n).toBe(10)
  })

  it('J3-05: dos ventanas que comparten un día se rechazan', async () => {
    const { error } = await createPrize(owner, draftRaffle, {
      p_title: 'Premio de ventanas solapadas',
      p_rules: [
        // De lunes a viernes, y otra vez ese mismo viernes.
        rule({ start_date: futureMonday, end_date: addDays(futureMonday, 4) }),
        rule({
          start_date: addDays(futureMonday, 4),
          end_date: addDays(futureMonday, 4),
          weekdays: [5],
        }),
      ],
    })
    expect(error?.message).toContain('el mismo día')
  })

  it('J3-06: las fechas tienen que caber dentro de la rifa', async () => {
    const { error } = await createPrize(owner, draftRaffle, {
      p_title: 'Premio fuera de fechas',
      // Una semana entera antes de que empiece la rifa: incluye todos sus días,
      // así que lo único que puede fallar es la ventana de la rifa.
      p_rules: [rule({ start_date: addDays(pastMonday, -30), end_date: addDays(pastMonday, -24) })],
    })
    expect(error?.message).toContain('dentro de las fechas de la rifa')
  })

  it('J3-07: un período que no incluye los días elegidos se rechaza', async () => {
    const { error } = await createPrize(owner, draftRaffle, {
      p_title: 'Premio sin sábados',
      p_rules: [
        rule({ start_date: futureMonday, end_date: addDays(futureMonday, 1), weekdays: [6] }),
      ],
    })
    expect(error?.message).toContain('no incluye todos los días')
  })
})

// =============================================================================
describe('J4 — la recompensa y las cifras (BR-J02, BR-J06)', () => {
  it('J4-01: un premio en dinero con descripción se rechaza', async () => {
    const { error } = await createPrize(owner, draftRaffle, {
      p_title: 'Premio incoherente',
      p_reward_description: 'una camioneta',
    })
    expect(error?.message).toContain('no lleva descripción')
  })

  it('J4-02: un premio en especie con valor en pesos se rechaza', async () => {
    const { error } = await createPrize(owner, draftRaffle, {
      p_title: 'Premio incoherente 2',
      p_reward_type: 'in_kind',
      p_reward_description: 'una camioneta',
      p_reward_amount: 100,
    })
    expect(error?.message).toContain('no lleva valor en pesos')
  })

  it('J4-03: ni la service role puede escribir una versión incoherente', async () => {
    await expect(
      db.query(
        `insert into raffle_prize_versions (organization_id, raffle_id, prize_id, version_number, status,
           title, category, reward_type, reward_amount, reward_description, number_field)
         values ($1, $2, gen_random_uuid(), 1, 'active', 'Incoherente', 'daily', 'cash', null, null, 'daily_number')`,
        [ctx.demoOrg.id, draftRaffle],
      ),
    ).rejects.toThrow(/reward_check/)
  })

  it('J4-04: el premio en especie guarda su descripción y no tiene valor', async () => {
    const premio = await prizeOf(owner, draftRaffle, {
      p_title: 'Camioneta',
      p_category: 'main',
      p_reward_type: 'in_kind',
      p_reward_description: 'Una camioneta',
      p_reward_amount: null,
    })
    const { rows } = await db.query(
      `select reward_type, reward_amount, reward_description from raffle_prize_versions where id = $1`,
      [premio.version_id],
    )
    expect(rows[0]).toMatchObject({
      reward_type: 'in_kind',
      reward_amount: null,
      reward_description: 'Una camioneta',
    })
  })

  it('J4-05: las cifras son cuatro si no se dicen, y las tres últimas se guardan', async () => {
    const cuatro = await prizeOf(owner, draftRaffle, { p_title: 'Premio de cuatro cifras' })
    const tres = await prizeOf(owner, draftRaffle, {
      p_title: 'Premio de tres cifras',
      p_digits: 'last_three',
    })

    const { rows } = await db.query<{ id: string; digits: string }>(
      `select id, digits from raffle_prize_versions where id = any ($1::uuid[])`,
      [[cuatro.version_id, tres.version_id]],
    )
    expect(rows.find((r) => r.id === cuatro.version_id)?.digits).toBe('four')
    expect(rows.find((r) => r.id === tres.version_id)?.digits).toBe('last_three')
  })

  it('J4-06: los límites de texto y de valor son los que dice la aplicación', async () => {
    const largo = await createPrize(owner, draftRaffle, { p_title: 'x'.repeat(81) })
    expect(largo.error?.message).toContain('80 caracteres')

    const carisimo = await createPrize(owner, draftRaffle, {
      p_title: 'Premio carísimo',
      p_reward_amount: 10_000_000_001,
    })
    expect(carisimo.error?.message).toContain('$10.000.000.000')

    const aclaraciones = await createPrize(owner, draftRaffle, {
      p_title: 'Premio con novela',
      p_conditions: 'x'.repeat(1001),
    })
    expect(aclaraciones.error?.message).toContain('1.000 caracteres')
  })
})

// =============================================================================
describe('J5 — versiones: inmutables, encadenadas y con control optimista (BR-J09)', () => {
  it('J5-01: publicar crea una versión nueva y deja la anterior intacta', async () => {
    const premio = await prizeOf(owner, draftRaffle, {
      p_title: 'Premio que cambia',
      p_reward_amount: 850000,
    })

    const { data, error } = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
      p_title: 'Premio que cambia',
      p_category: 'daily',
      p_reward_type: 'cash',
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [rule()],
      p_reward_amount: 900000,
    })
    expect(error).toBeNull()

    const nueva = (data as unknown as PrizeResult[])[0]!
    expect(nueva.version_number).toBe(2)

    const { rows } = await db.query<{ version_number: number; reward_amount: string }>(
      `select version_number, reward_amount from raffle_prize_versions where prize_id = $1 order by version_number`,
      [premio.prize_id],
    )
    expect(rows.map((r) => Number(r.reward_amount))).toEqual([850000, 900000])
  })

  it('J5-02: una versión anterior no se modifica ni se borra, tampoco con la service role', async () => {
    const premio = await prizeOf(owner, draftRaffle, { p_title: 'Premio inmutable' })

    await expect(
      db.query(`update raffle_prize_versions set title = 'Otro' where id = $1`, [
        premio.version_id,
      ]),
    ).rejects.toThrow(/no se modifica ni se borra/)

    await expect(
      db.query(`delete from raffle_prize_versions where id = $1`, [premio.version_id]),
    ).rejects.toThrow(/no se modifica ni se borra/)

    await expect(
      db.query(
        `update raffle_prize_schedule_rules set end_date = start_date where version_id = $1`,
        [premio.version_id],
      ),
    ).rejects.toThrow(/no se modifica ni se borra/)
  })

  it('J5-03: la versión que la persona estaba viendo tiene que seguir siendo la vigente', async () => {
    const premio = await prizeOf(owner, draftRaffle, { p_title: 'Premio con dos editores' })

    const publicar = (client: Client, amount: number) =>
      client.rpc('publish_raffle_prize_version', {
        p_prize_id: premio.prize_id,
        p_expected_version_id: premio.version_id,
        p_title: 'Premio con dos editores',
        p_category: 'daily',
        p_reward_type: 'cash',
        p_number_field: 'daily_number',
        p_digits: 'four',
        p_rules: [rule()],
        p_reward_amount: amount,
      })

    const [uno, dos] = await Promise.all([publicar(owner, 700000), publicar(admin, 800000)])
    const errores = [uno.error, dos.error].filter(Boolean)

    expect(errores).toHaveLength(1)
    expect(errores[0]!.message).toContain('Alguien cambió este premio')

    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from raffle_prize_versions where prize_id = $1`,
      [premio.prize_id],
    )
    expect(rows[0]!.n).toBe(2)
  })

  it('J5-04: guardar sin cambios no crea versión, ni bitácora, ni aviso', async () => {
    // El importe se fija aquí para poder volver a enviar EXACTAMENTE lo mismo.
    const premio = await prizeOf(owner, draftRaffle, {
      p_title: 'Premio sin cambios',
      p_reward_amount: 500000,
    })
    const antes = await countAudit(premio.prize_id)

    const { data, error } = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
      p_title: 'Premio sin cambios',
      p_category: 'daily',
      p_reward_type: 'cash',
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [rule()],
      p_reward_amount: 500000,
    })

    expect(error).toBeNull()
    expect((data as unknown as PrizeResult[])[0]!.version_id).toBe(premio.version_id)
    expect(await countAudit(premio.prize_id)).toBe(antes)
  })

  it('J5-05: la versión que aplica a un sorteo es la última publicada antes de su corte', async () => {
    const premio = await prizeOf(owner, draftRaffle, { p_title: 'Premio con corte' })
    const { rows } = await db.query<{ aplica: string | null }>(
      `select raffle_prize_applicable_version($1, now() + interval '1 day') as aplica`,
      [premio.prize_id],
    )
    expect(rows[0]!.aplica).toBe(premio.version_id)

    const { rows: antes } = await db.query<{ aplica: string | null }>(
      `select raffle_prize_applicable_version($1, now() - interval '1 day') as aplica`,
      [premio.prize_id],
    )
    expect(antes[0]!.aplica).toBeNull()
  })
})

// =============================================================================
describe('J6 — archivar, restaurar y reordenar (BR-J01, BR-J11)', () => {
  it('J6-01: archivar no borra nada y deja su versión archivada', async () => {
    const premio = await prizeOf(owner, draftRaffle, { p_title: 'Premio que se archiva' })

    const { data, error } = await owner.rpc('archive_raffle_prize', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
    })
    expect(error).toBeNull()

    const archivada = (data as unknown as PrizeResult[])[0]!
    const { rows } = await db.query(
      `select p.status, p.position, p.archived_by, v.status as version_status,
              (select count(*)::int from raffle_prize_versions x where x.prize_id = p.id) as versiones,
              (select count(*)::int from raffle_prize_schedule_rules r where r.version_id = $2) as periodos
         from raffle_prizes p join raffle_prize_versions v on v.id = p.current_version_id
        where p.id = $1`,
      [premio.prize_id, archivada.version_id],
    )
    expect(rows[0]).toMatchObject({
      status: 'archived',
      position: null,
      archived_by: ctx.ids.owner,
      version_status: 'archived',
      versiones: 2,
    })
    expect(Number((rows[0] as { periodos: number }).periodos)).toBeGreaterThan(0)
  })

  it('J6-02: restaurar lo devuelve al final del orden, con una versión nueva', async () => {
    const premio = await prizeOf(owner, draftRaffle, { p_title: 'Premio que vuelve' })
    const archivado = await owner.rpc('archive_raffle_prize', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
    })
    const version = (archivado.data as unknown as PrizeResult[])[0]!

    const { data, error } = await owner.rpc('restore_raffle_prize', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: version.version_id,
    })
    expect(error).toBeNull()
    expect((data as unknown as PrizeResult[])[0]!.version_number).toBe(3)

    const { rows } = await db.query<{
      status: string
      position: number
      archived_at: string | null
    }>(`select status, position, archived_at from raffle_prizes where id = $1`, [premio.prize_id])
    expect(rows[0]).toMatchObject({ status: 'active', archived_at: null })
    expect(rows[0]!.position).toBeGreaterThan(0)
  })

  it('J6-03: una rifa activa no se queda sin premios vigentes', async () => {
    const { rows } = await db.query<{ id: string; current_version_id: string }>(
      `select id, current_version_id from raffle_prizes where raffle_id = $1 and status = 'active'`,
      [activeRaffle],
    )
    expect(rows).toHaveLength(1)

    const { error } = await owner.rpc('archive_raffle_prize', {
      p_prize_id: rows[0]!.id,
      p_expected_version_id: rows[0]!.current_version_id,
    })
    expect(error?.message).toContain('al menos un premio vigente')
  })

  it('J6-04: reordenar exige el conjunto exacto y no crea versiones', async () => {
    const raffleId = await newRaffle(`Premios orden ${Date.now().toString(36)}`)
    const a = await prizeOf(owner, raffleId, { p_title: 'Primero' })
    const b = await prizeOf(owner, raffleId, {
      p_title: 'Segundo',
      p_rules: [
        rule({ start_date: addDays(futureMonday, 21), end_date: addDays(futureMonday, 25) }),
      ],
    })

    const incompleto = await owner.rpc('reorder_raffle_prizes', {
      p_raffle_id: raffleId,
      p_prize_ids: [a.prize_id],
    })
    expect(incompleto.error?.message).toContain('no corresponde a los premios vigentes')

    const { error } = await owner.rpc('reorder_raffle_prizes', {
      p_raffle_id: raffleId,
      p_prize_ids: [b.prize_id, a.prize_id],
    })
    expect(error).toBeNull()

    const { rows } = await db.query<{ id: string; position: number; versiones: number }>(
      `select p.id, p.position,
              (select count(*)::int from raffle_prize_versions v where v.prize_id = p.id) as versiones
         from raffle_prizes p where p.raffle_id = $1 order by p.position`,
      [raffleId],
    )
    expect(rows.map((r) => r.id)).toEqual([b.prize_id, a.prize_id])
    expect(rows.every((r) => Number(r.versiones) === 1)).toBe(true)
  })
})

// =============================================================================
describe('J7 — duplicados y sorteos sin resultado (BR-J05, BR-J08)', () => {
  it('J7-01: un duplicado exacto se rechaza y dice con cuál choca', async () => {
    const raffleId = await newRaffle(`Premios duplicado ${Date.now().toString(36)}`)
    // El MISMO importe a propósito: lo que hace duplicado a un premio son sus
    // condiciones y su recompensa, nunca su nombre (BR-J08).
    await prizeOf(owner, raffleId, { p_title: 'Premio de los sábados', p_reward_amount: 300000 })

    const { error } = await createPrize(owner, raffleId, {
      p_title: 'El mismo, con otro nombre',
      p_reward_amount: 300000,
    })
    expect(error?.message).toContain('Ya existe un premio con las mismas condiciones')
    expect(error?.message).toContain('Premio de los sábados')
  })

  it('J7-02: el mismo calendario con otra recompensa SÍ se puede (se suman)', async () => {
    const raffleId = await newRaffle(`Premios suma ${Date.now().toString(36)}`)
    await prizeOf(owner, raffleId, { p_title: 'Premio A', p_reward_amount: 300000 })

    const { error } = await createPrize(owner, raffleId, {
      p_title: 'Premio B',
      p_reward_amount: 1000000,
    })
    expect(error).toBeNull()
  })

  it('J7-03: un sorteo futuro cancelado se rechaza antes de guardar', async () => {
    const raffleId = await newRaffle(`Premios cancelado ${Date.now().toString(36)}`)
    // Un martes lejos de la ventana que usan las demás pruebas: la programación
    // es NACIONAL, así que un sorteo cancelado ahí las afectaría a todas.
    const dia = addDays(futureMonday, 43)
    expect(isoWeekday(dia)).toBe(2)

    const { rows } = await db.query<{ id: string }>(
      `insert into lottery_draw_schedules (lottery_code, draw_number, reference_date, schedule_status,
         original_scheduled_at, official_scheduled_at)
       values ('cruz_roja', $1, $2, 'cancelled', $3::timestamptz, $3::timestamptz)
       returning id`,
      [`PRZ-${Date.now()}`, dia, `${dia}T22:30:00-05:00`],
    )
    createdSchedules.push(rows[0]!.id)

    const { error } = await createPrize(owner, raffleId, {
      p_title: 'Premio de un sorteo cancelado',
      p_rules: [rule({ start_date: dia, end_date: dia, weekdays: [2] })],
    })
    expect(error?.message).toContain('está cancelado en la programación oficial')

    // Se retira en cuanto se comprueba: ninguna otra prueba tiene por qué
    // cargar con un sorteo cancelado.
    await db.query(`delete from lottery_draw_schedules where id = $1`, [rows[0]!.id])
  })
})

// =============================================================================
describe('J8 — el corte de una rifa activa (BR-J09)', () => {
  it('J8-01: sin la hora oficial de una semana que ya empezó, no se guarda', async () => {
    const { rows } = await db.query<{ id: string; current_version_id: string }>(
      `select id, current_version_id from raffle_prizes where raffle_id = $1 and status = 'active'`,
      [activeRaffle],
    )
    const premio = rows[0]!

    const { error } = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.id,
      p_expected_version_id: premio.current_version_id,
      p_title: 'Premio de la rifa activa',
      p_category: 'daily',
      p_reward_type: 'cash',
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [rule({ start_date: pastMonday, end_date: addDays(pastMonday, 4) })],
      p_reward_amount: 500000,
    })
    expect(error?.message).toContain('hora oficial del sorteo')
  })

  it('J8-02: con la programación oficial publicada, el mismo cambio se guarda', async () => {
    const { rows: prizeRows } = await db.query<{ id: string; current_version_id: string }>(
      `select id, current_version_id from raffle_prizes where raffle_id = $1 and status = 'active'`,
      [activeRaffle],
    )
    const premio = prizeRows[0]!
    const dia = addDays(pastMonday, 1) // martes: Cruz Roja

    const { rows } = await db.query<{ id: string }>(
      `insert into lottery_draw_schedules (lottery_code, draw_number, reference_date, schedule_status,
         original_scheduled_at, official_scheduled_at)
       values ('cruz_roja', $1, $2, 'completed', $3::timestamptz, $3::timestamptz)
       returning id`,
      [`PRZ-${Date.now()}`, dia, `${dia}T22:30:00-05:00`],
    )
    createdSchedules.push(rows[0]!.id)

    const { error } = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.id,
      p_expected_version_id: premio.current_version_id,
      p_title: 'Premio de la rifa activa',
      p_category: 'daily',
      p_reward_type: 'cash',
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [rule({ start_date: dia, end_date: dia, weekdays: [2] })],
      p_reward_amount: 500000,
    })
    expect(error).toBeNull()
  })
})

// =============================================================================
describe('J9 — auditoría, historial y avisos (BR-J11, BR-J12)', () => {
  it('J9-01: una fila de bitácora por guardado, y ninguna con datos de la cartera', async () => {
    const premio = await prizeOf(owner, draftRaffle, { p_title: 'Premio auditado' })
    expect(await countAudit(premio.prize_id)).toBe(1)

    const archivado = await owner.rpc('archive_raffle_prize', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
    })
    expect(archivado.error).toBeNull()
    expect(await countAudit(premio.prize_id)).toBe(2)

    const { rows } = await db.query<{ action: string; new_values: Record<string, unknown> }>(
      `select action, new_values from audit_logs
        where entity_type = 'raffle_prize' and entity_id = $1 order by created_at`,
      [premio.prize_id],
    )
    expect(rows.map((r) => r.action)).toEqual(['raffle_prize.create', 'raffle_prize.archive'])

    const anotado = JSON.stringify(rows)
    for (const prohibido of ['client_id', 'sale_price', 'paid_amount', 'payment', 'cliente']) {
      expect(anotado).not.toContain(prohibido)
    }
  })

  it('J9-02: el historial sale de las versiones, con actor y fecha', async () => {
    const premio = await prizeOf(admin, draftRaffle, { p_title: 'Premio con historial' })
    await admin.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
      p_title: 'Premio con historial',
      p_category: 'special',
      p_reward_type: 'cash',
      p_number_field: 'daily_number',
      p_digits: 'last_three',
      p_rules: [rule()],
      p_reward_amount: 500000,
    })

    const { data, error } = await owner.rpc('raffle_prize_history', { p_prize_id: premio.prize_id })
    expect(error).toBeNull()

    const historial = data as unknown as Array<Record<string, unknown>>
    expect(historial).toHaveLength(2)
    expect(historial[0]).toMatchObject({
      version_number: 2,
      change: 'updated',
      digits: 'last_three',
    })
    expect(historial[1]).toMatchObject({ version_number: 1, change: 'created' })
    expect(historial[0]!.published_by).toBe(ctx.ids.admin)
    expect(historial[0]!.published_by_name).toBeTruthy()
    expect(Number(historial[0]!.total_count)).toBe(2)
    expect(Array.isArray(historial[0]!.rules)).toBe(true)
  })

  it('J9-03: el historial de otra organización y el de un vendedor vienen vacíos', async () => {
    const premio = await prizeOf(owner, draftRaffle, { p_title: 'Premio reservado' })

    for (const client of [seller, otherOrgOwner]) {
      const { data, error } = await client.rpc('raffle_prize_history', {
        p_prize_id: premio.prize_id,
      })
      expect(error).toBeNull()
      expect(data).toEqual([])
    }
  })

  it('J9-04: una rifa en borrador no avisa a nadie', async () => {
    const premio = await prizeOf(owner, draftRaffle, { p_title: 'Premio silencioso' })
    expect(await notificationsOf(premio.version_id)).toHaveLength(0)
  })

  it('J9-05: en una rifa activa se avisa una vez a cada membresía activa, menos a quien lo hizo', async () => {
    const premio = await prizeOf(owner, activeRaffle, {
      p_title: 'Premio que avisa',
      p_rules: [
        rule({ start_date: addDays(futureMonday, 28), end_date: addDays(futureMonday, 32) }),
      ],
    })

    const avisos = await notificationsOf(premio.version_id)
    const { rows } = await db.query<{ profile_id: string }>(
      `select m.profile_id
         from memberships m
         join profiles p on p.id = m.profile_id
         join organizations o on o.id = m.organization_id
        where m.organization_id = $1 and m.is_active and p.is_active and o.is_active
          and m.profile_id <> $2`,
      [ctx.demoOrg.id, ctx.ids.owner],
    )

    expect(avisos.map((a) => a.recipient_profile_id).sort()).toEqual(
      rows.map((r) => r.profile_id).sort(),
    )
    expect(avisos.some((a) => a.recipient_profile_id === ctx.ids.owner)).toBe(false)

    const datos = avisos[0]!.data
    expect(datos).toMatchObject({ prize_title: 'Premio que avisa', change: 'created' })
    expect(JSON.stringify(datos)).not.toContain('sale_price')
  })

  it('J9-06: no se avisa a otra organización ni a una cuenta inactiva', async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n
         from notifications n
         join memberships m on m.profile_id = n.recipient_profile_id
        where n.kind = 'raffle_prize.changed'
          and (n.organization_id <> $1 or not m.is_active)`,
      [ctx.demoOrg.id],
    )
    expect(rows[0]!.n).toBe(0)
  })

  it('J9-07: cambiar solo el nombre no avisa; cambiar la recompensa sí', async () => {
    const premio = await prizeOf(owner, activeRaffle, {
      p_title: 'Premio material',
      p_rules: [
        rule({ start_date: addDays(futureMonday, 35), end_date: addDays(futureMonday, 39) }),
      ],
      // Fijo: lo único que cambia en la primera publicación tiene que ser el nombre.
      p_reward_amount: 500000,
    })

    const soloNombre = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
      p_title: 'Premio material, con otro nombre',
      p_category: 'daily',
      p_reward_type: 'cash',
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [
        rule({ start_date: addDays(futureMonday, 35), end_date: addDays(futureMonday, 39) }),
      ],
      p_reward_amount: 500000,
    })
    const v2 = (soloNombre.data as unknown as PrizeResult[])[0]!
    expect(await notificationsOf(v2.version_id)).toHaveLength(0)

    const conRecompensa = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: v2.version_id,
      p_title: 'Premio material, con otro nombre',
      p_category: 'daily',
      p_reward_type: 'cash',
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [
        rule({ start_date: addDays(futureMonday, 35), end_date: addDays(futureMonday, 39) }),
      ],
      p_reward_amount: 750000,
    })
    const v3 = (conRecompensa.data as unknown as PrizeResult[])[0]!
    expect((await notificationsOf(v3.version_id)).length).toBeGreaterThan(0)
  })

  it('J9-08: reordenar no avisa', async () => {
    const antes = await db.query<{ n: number }>(
      `select count(*)::int as n from notifications where kind = 'raffle_prize.changed'`,
    )
    const { rows } = await db.query<{ id: string }>(
      `select id from raffle_prizes where raffle_id = $1 and status = 'active' order by position`,
      [activeRaffle],
    )
    const { error } = await owner.rpc('reorder_raffle_prizes', {
      p_raffle_id: activeRaffle,
      p_prize_ids: rows.map((r) => r.id).reverse(),
    })
    expect(error).toBeNull()

    const despues = await db.query<{ n: number }>(
      `select count(*)::int as n from notifications where kind = 'raffle_prize.changed'`,
    )
    expect(despues.rows[0]!.n).toBe(antes.rows[0]!.n)
  })

  it('J9-09: el personal ve los premios en la bitácora redactada, y sin cartera', async () => {
    const { data, error } = await owner.rpc('admin_audit_log', { p_entity_type: 'raffle_prize' })
    expect(error).toBeNull()

    const filas = data as unknown as Array<Record<string, unknown>>
    expect(filas.length).toBeGreaterThan(0)
    const texto = JSON.stringify(filas)
    for (const prohibido of ['client_id', 'sale_price', 'paid_amount']) {
      expect(texto).not.toContain(prohibido)
    }
  })
})

// =============================================================================
describe('J10 — lectura y escritura directa (BR-J14, BR-Q01)', () => {
  it('J10-01: los miembros de la organización leen los premios de sus rifas', async () => {
    const { data, error } = await seller
      .from('raffle_prizes')
      .select('id, status, position, current_version_id')
      .eq('raffle_id', draftRaffle)
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
  })

  it('J10-02: el contrato de lectura de la pantalla: premio, versión vigente y períodos en UNA consulta', async () => {
    const { data, error } = await owner
      .from('raffle_prizes')
      .select(
        'id, position, status, current:raffle_prize_versions!raffle_prizes_current_version_fk(title, digits, number_field, reward_type, reward_amount, rules:raffle_prize_schedule_rules(start_date, end_date, weekdays, lottery_mode, lottery_code))',
      )
      .eq('raffle_id', draftRaffle)
      .eq('status', 'active')
      .order('position')

    expect(error).toBeNull()
    const primero = (data ?? [])[0] as unknown as {
      current: { title: string; rules: unknown[] } | null
    }
    expect(primero?.current?.title).toBeTruthy()
    expect(Array.isArray(primero?.current?.rules)).toBe(true)
  })

  it('J10-03: otra organización no ve ni un premio', async () => {
    const { data, error } = await otherOrgOwner.from('raffle_prizes').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('J10-04: un visitante sin sesión no lee nada', async () => {
    const visitante = anonClient()
    for (const tabla of [
      'raffle_prizes',
      'raffle_prize_versions',
      'raffle_prize_schedule_rules',
    ] as const) {
      const { data } = await visitante.from(tabla).select('id')
      expect(data ?? []).toEqual([])
    }
  })

  it('J10-05: nadie escribe directo en las tres tablas', async () => {
    const insercion = await owner.from('raffle_prizes').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: draftRaffle,
      current_version_id: '11111111-2222-4333-8444-555555555555',
    } as never)
    expect(insercion.error?.code).toBe('42501')

    const actualizacion = await owner
      .from('raffle_prizes')
      .update({ position: 99 } as never)
      .eq('raffle_id', draftRaffle)
    expect(actualizacion.error?.code).toBe('42501')

    const borrado = await owner.from('raffle_prize_versions').delete().eq('raffle_id', draftRaffle)
    expect(borrado.error?.code).toBe('42501')
  })

  it('J10-06: un premio no se borra ni con la service role', async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from raffle_prizes where raffle_id = $1 limit 1`,
      [draftRaffle],
    )
    await expect(
      db.query(`delete from raffle_prizes where id = $1`, [rows[0]!.id]),
    ).rejects.toThrow(/no se borra/)
  })
})

// =============================================================================
describe('J11 — catálogo: privilegios, RLS y la regresión de D-198', () => {
  const RPC_PUBLICAS = [
    'archive_raffle_prize',
    'create_raffle_prize',
    'publish_raffle_prize_version',
    'raffle_prize_history',
    'reorder_raffle_prizes',
    'restore_raffle_prize',
  ]

  const INTERNAS = [
    'app_capability_catalog',
    'app_role_default_capabilities',
    'has_org_capability',
    'lottery_for_weekday',
    'lottery_nominal_weekday',
    'raffle_prize_applicable_version',
    'raffle_prize_audit_values',
    'raffle_prize_clean_fields',
    'raffle_prize_cutoff_problem',
    'raffle_prize_insert_version',
    'raffle_prize_is_material',
    'raffle_prize_lock',
    'raffle_prize_manageable_raffle',
    'raffle_prize_normalized_rules',
    'raffle_prize_notify',
    'raffle_prize_rule_covers_weekdays',
    'raffle_prize_rule_dates',
    'raffle_prize_rules_json',
    'raffle_prize_version_problem',
    'raffle_prize_weekdays_valid',
    'raffles_guard_prize_config',
  ]

  it('J11-01: las seis RPC son ejecutables por una sesión', async () => {
    const { rows } = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1)
          and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        order by p.proname`,
      [RPC_PUBLICAS],
    )
    expect(rows.map((r) => r.proname)).toEqual(RPC_PUBLICAS)
  })

  it('J11-02: las internas NO lo son (I-078)', async () => {
    const { rows } = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1)
          and has_function_privilege('authenticated', p.oid, 'EXECUTE')`,
      [INTERNAS],
    )
    expect(rows.map((r) => r.proname)).toEqual([])
  })

  it('J11-03: ninguna es ejecutable por anon ni por PUBLIC (I-020)', async () => {
    const { rows } = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1)
          and (has_function_privilege('anon', p.oid, 'EXECUTE')
               or has_function_privilege('public', p.oid, 'EXECUTE'))`,
      [[...RPC_PUBLICAS, ...INTERNAS]],
    )
    expect(rows.map((r) => r.proname)).toEqual([])
  })

  it('J11-04: las tres tablas tienen RLS forzada y solo políticas de SELECT', async () => {
    const { rows } = await db.query<{ relname: string; forzada: boolean }>(
      `select c.relname, c.relforcerowsecurity as forzada
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in ('raffle_prizes', 'raffle_prize_versions', 'raffle_prize_schedule_rules')`,
    )
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.forzada)).toBe(true)

    const { rows: politicas } = await db.query<{ cmd: string }>(
      `select cmd from pg_policies
        where schemaname = 'public'
          and tablename in ('raffle_prizes', 'raffle_prize_versions', 'raffle_prize_schedule_rules')`,
    )
    expect(politicas).toHaveLength(3)
    expect(politicas.every((p) => p.cmd === 'SELECT')).toBe(true)
  })

  it('J11-05: `authenticated` solo tiene SELECT y `anon` no tiene nada', async () => {
    const { rows } = await db.query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in ('raffle_prizes', 'raffle_prize_versions', 'raffle_prize_schedule_rules')
          and grantee in ('authenticated', 'anon')
          and privilege_type <> 'SELECT'`,
    )
    expect(rows).toEqual([])

    const { rows: anon } = await db.query<{ n: number }>(
      `select count(*)::int as n from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in ('raffle_prizes', 'raffle_prize_versions', 'raffle_prize_schedule_rules')
          and grantee = 'anon'`,
    )
    expect(anon[0]!.n).toBe(0)
  })

  it('J11-06: ninguna función nueva devuelve nada de la cartera (D-198)', async () => {
    const { rows } = await db.query<{ proname: string; resultado: string }>(
      `select p.proname, pg_get_function_result(p.oid) as resultado
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (p.proname like 'raffle\\_prize%' or p.proname like '%capability%')
        order by p.proname`,
    )
    const PROHIBIDAS =
      /\b(client_id|client_name|sale_price|base_price|paid_amount|pending_amount|payment_status|total_amount|phone|email)\b/
    for (const row of rows) expect(row.resultado, row.proname).not.toMatch(PROHIBIDAS)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('J11-07: los índices que sostienen las consultas existen', async () => {
    const { rows } = await db.query<{ indexname: string }>(
      `select indexname from pg_indexes
        where schemaname = 'public'
          and indexname in ('raffle_prizes_position_key', 'raffle_prize_versions_number_key',
                            'raffle_prize_schedule_rules_position_key', 'notifications_raffle_prize_once')
        order by indexname`,
    )
    expect(rows.map((r) => r.indexname)).toEqual([
      'notifications_raffle_prize_once',
      'raffle_prize_schedule_rules_position_key',
      'raffle_prize_versions_number_key',
      'raffle_prizes_position_key',
    ])
  })

  it('J11-08: las rifas de siempre siguen en modo heredado', async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from raffles where prize_mode <> 'legacy' and id <> all ($1::uuid[])`,
      [createdRaffles],
    )
    expect(rows[0]!.n).toBe(0)
  })
})
