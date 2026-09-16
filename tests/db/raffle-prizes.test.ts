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

import { confirmedRafflePrizes } from '@/features/raffle-prizes/transition'
import { ROLE_DEFAULT_CAPABILITIES, APP_CAPABILITIES } from '@/lib/auth/capabilities'
import { hasCapability } from '@/lib/auth/capability-resolver'
import type { ActiveMembership } from '@/lib/auth/session'

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
 * Cada premio de esta suite juega su PROPIO día.
 *
 * NO es un adorno: desde D-201 dos premios vigentes que un mismo día juegan con
 * el mismo número, las mismas cifras y la misma lotería son un CONFLICTO, y la
 * recompensa ya no los distingue —antes bastaba con cambiar el importe—. Sin
 * esto, el segundo premio de cada rifa chocaría con el primero, que es justo lo
 * que comprueban J7-01 y J7-02 con dos calendarios puestos a mano.
 *
 * Los días automáticos empiezan LEJOS de la ventana que usan las pruebas de
 * calendario, para que un premio con fechas escritas a mano nunca choque con uno
 * repartido por este contador. Cada premio ocupa UN día —el domingo se salta,
 * que no tiene lotería— y así la rifa no necesita durar años.
 */
const PRIMER_DIA_LIBRE = 70
let diasUsados = 0

function diaLibre(): PrizeRulePayload {
  diasUsados += 1
  let dia = addDays(futureMonday, PRIMER_DIA_LIBRE + diasUsados)
  if (isoWeekday(dia) === 7) {
    diasUsados += 1
    dia = addDays(futureMonday, PRIMER_DIA_LIBRE + diasUsados)
  }
  return rule({ start_date: dia, end_date: dia, weekdays: [isoWeekday(dia)] })
}

/** Una recompensa única en dinero, que es lo que lleva casi todo premio. */
function dinero(amount: number) {
  return [{ description: null, amount }]
}

async function createPrize(
  client: Client,
  raffleId: string,
  overrides: Record<string, unknown> = {},
) {
  return client.rpc('create_raffle_prize', {
    p_raffle_id: raffleId,
    p_title: 'Premio diario',
    p_category: 'daily',
    p_reward_mode: 'fixed',
    p_reward_options: dinero(500000),
    p_number_field: 'daily_number',
    p_rules: [diaLibre()],
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
      options.end ?? addDays(futureMonday, 500),
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
    `delete from raffle_prize_reward_options where version_id in (
       select id from raffle_prize_versions where raffle_id = any ($1::uuid[]))`,
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
    const dia = diaLibre()
    const premio = await prizeOf(admin, draftRaffle, {
      p_title: 'Premio del administrador',
      p_rules: [dia],
    })
    const publicado = await admin.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
      p_title: 'Premio del administrador',
      p_category: 'daily',
      p_reward_mode: 'fixed',
      p_reward_options: dinero(600000),
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [dia],
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

  it('J1-08: la aplicación resuelve la capacidad igual que PostgreSQL para Dueño, Administrador y Vendedor', async () => {
    // D-202: las acciones y las páginas preguntan al resolvedor central con la
    // MEMBRESÍA COMPLETA. Aquí se le da la de verdad —leída de la base— y se
    // compara con lo que responde `has_org_capability` con la identidad de esa
    // misma persona, que es la autoridad.
    const personas = [
      { rol: 'owner', id: ctx.ids.owner, espera: true },
      { rol: 'admin', id: ctx.ids.admin, espera: true },
      { rol: 'seller', id: ctx.ids.seller1, espera: false },
    ] as const

    for (const persona of personas) {
      const { rows: filas } = await db.query<{
        role: ActiveMembership['role']
        organization_name: string
        full_name: string
        email: string
        alias: string | null
        activated_at: string | null
      }>(
        `select m.role, o.name as organization_name, p.full_name, p.email, p.alias,
                p.activated_at::text as activated_at
           from memberships m
           join profiles p on p.id = m.profile_id
           join organizations o on o.id = m.organization_id
          where m.profile_id = $1 and m.organization_id = $2`,
        [persona.id, ctx.demoOrg.id],
      )
      const fila = filas[0]!
      expect(fila.role).toBe(persona.rol)

      const membership: ActiveMembership = {
        organizationId: ctx.demoOrg.id,
        organizationName: fila.organization_name,
        role: fila.role,
        profileId: persona.id,
        fullName: fila.full_name,
        email: fila.email,
        alias: fila.alias,
        activatedAt: fila.activated_at,
      }

      for (const capability of APP_CAPABILITIES) {
        // En una transacción explícita: con la identidad puesta en la misma
        // sentencia, un «no» podría salir aunque no se hubiera aplicado.
        await db.query('begin')
        let puede: boolean
        try {
          await db.query(
            `select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
            [persona.id],
          )
          const { rows } = await db.query<{ puede: boolean }>(
            `select has_org_capability($1, $2) as puede`,
            [ctx.demoOrg.id, capability],
          )
          puede = rows[0]!.puede
        } finally {
          await db.query('rollback')
        }

        expect(puede, `PostgreSQL · ${persona.rol} · ${capability}`).toBe(persona.espera)
        expect(
          await hasCapability(membership, capability),
          `aplicación · ${persona.rol} · ${capability}`,
        ).toBe(puede)
      }
    }
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

  // EJEMPLO GENÉRICO, no un premio de la rifa real (D-204). El dueño lo dio para
  // mostrar que el sistema admite excepciones a la plantilla —BR-J03: la
  // categoría no decide nada—. Nunca dijo que entregara $400.000 ni que jugara el
  // 14 de diciembre, y la rifa de diciembre tiene SEIS premios, ninguno así.
  it('J3-03: EJEMPLO GENÉRICO —no es un premio de la rifa real—: número SEMANAL un lunes con Cundinamarca es válido', async () => {
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
      p_reward_options: dinero(1000000),
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
  it('J4-01: una alternativa sin dinero y sin especie se rechaza', async () => {
    const { error } = await createPrize(owner, draftRaffle, {
      p_title: 'Premio vacío',
      p_reward_options: [{ description: null, amount: null }],
    })
    expect(error?.message).toContain('el dinero, lo que se entrega, o las dos cosas')
  })

  it('J4-02: una alternativa puede entregar una cosa Y dinero a la vez', async () => {
    const premio = await prizeOf(owner, draftRaffle, {
      p_title: 'Camioneta con estreno',
      p_category: 'main',
      p_reward_options: [{ description: 'Renault Alaskan 2023', amount: 20000000 }],
    })
    const { rows } = await db.query(
      `select o.description, o.amount::bigint from raffle_prize_reward_options o where o.version_id = $1`,
      [premio.version_id],
    )
    expect(rows[0]).toMatchObject({ description: 'Renault Alaskan 2023' })
    expect(Number((rows[0] as { amount: string }).amount)).toBe(20000000)
  })

  it('J4-03: ni la service role puede escribir una opción vacía', async () => {
    const premio = await prizeOf(owner, draftRaffle, { p_title: `Premio con opción vacía` })
    await expect(
      db.query(
        `insert into raffle_prize_reward_options (organization_id, version_id, position, description, amount)
         values ($1, $2, 2, null, null)`,
        [ctx.demoOrg.id, premio.version_id],
      ),
    ).rejects.toThrow(/components_check/)
  })

  it('J4-04: el premio en especie guarda su descripción y no tiene valor', async () => {
    const premio = await prizeOf(owner, draftRaffle, {
      p_title: 'Camioneta',
      p_category: 'main',
      p_reward_options: [{ description: 'Una camioneta', amount: null }],
    })
    const { rows } = await db.query(
      `select v.reward_mode, o.position, o.description, o.amount
         from raffle_prize_versions v
         join raffle_prize_reward_options o on o.version_id = v.id
        where v.id = $1`,
      [premio.version_id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      reward_mode: 'fixed',
      position: 1,
      description: 'Una camioneta',
      amount: null,
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
      p_reward_options: dinero(10_000_000_001),
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
    const dia = diaLibre()
    const premio = await prizeOf(owner, draftRaffle, {
      p_title: 'Premio que cambia',
      p_reward_options: dinero(850000),
      p_rules: [dia],
    })

    const { data, error } = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
      p_title: 'Premio que cambia',
      p_category: 'daily',
      p_reward_mode: 'fixed',
      p_reward_options: dinero(900000),
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [dia],
    })
    expect(error).toBeNull()

    const nueva = (data as unknown as PrizeResult[])[0]!
    expect(nueva.version_number).toBe(2)

    const { rows } = await db.query<{ version_number: number; amount: string }>(
      `select v.version_number, o.amount
         from raffle_prize_versions v
         join raffle_prize_reward_options o on o.version_id = v.id
        where v.prize_id = $1 order by v.version_number`,
      [premio.prize_id],
    )
    expect(rows.map((r) => Number(r.amount))).toEqual([850000, 900000])
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
    const dia = diaLibre()
    const premio = await prizeOf(owner, draftRaffle, {
      p_title: 'Premio con dos editores',
      p_rules: [dia],
    })

    const publicar = (client: Client, amount: number) =>
      client.rpc('publish_raffle_prize_version', {
        p_prize_id: premio.prize_id,
        p_expected_version_id: premio.version_id,
        p_title: 'Premio con dos editores',
        p_category: 'daily',
        p_reward_mode: 'fixed',
        p_reward_options: dinero(amount),
        p_number_field: 'daily_number',
        p_digits: 'four',
        p_rules: [dia],
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
    // Calendario y recompensa fijos aquí: hay que enviar EXACTAMENTE lo mismo.
    const dia = diaLibre()
    const premio = await prizeOf(owner, draftRaffle, {
      p_title: 'Premio sin cambios',
      p_reward_options: dinero(500000),
      p_rules: [dia],
    })
    const antes = await countAudit(premio.prize_id)

    const { data, error } = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
      p_title: 'Premio sin cambios',
      p_category: 'daily',
      p_reward_mode: 'fixed',
      p_reward_options: dinero(500000),
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [dia],
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
describe('J7 — conflictos de configuración y sorteos sin resultado (BR-J05, BR-J08)', () => {
  it('J7-01: dos premios que juegan el mismo día con la misma regla chocan', async () => {
    const raffleId = await newRaffle(`Premios conflicto ${Date.now().toString(36)}`)
    const dia = diaLibre()
    await prizeOf(owner, raffleId, { p_title: 'Premio del día', p_rules: [dia] })

    // Otra recompensa y otro nombre: desde D-201 eso ya no los distingue, porque
    // los premios NO se acumulan y el cruce no se puede resolver.
    const { error } = await createPrize(owner, raffleId, {
      p_title: 'El mismo día, con otro nombre',
      p_reward_options: dinero(1000000),
      p_rules: [dia],
    })
    expect(error?.message).toContain('juegan el')
    expect(error?.message).toContain('Premio del día')
    expect(error?.message).toContain('El mismo día, con otro nombre')

    // El día del conflicto es el que comparten.
    const [anio, mes, numero] = dia.start_date.split('-')
    expect(error?.message).toContain(`${numero}/${mes}/${anio}`)
  })

  it('J7-02: cuatro cifras y últimas tres conviven el mismo día (BR-J07)', async () => {
    const raffleId = await newRaffle(`Premios convivencia ${Date.now().toString(36)}`)
    const dia = diaLibre()
    await prizeOf(owner, raffleId, { p_title: 'Premio de cuatro cifras', p_rules: [dia] })

    const tres = await createPrize(owner, raffleId, {
      p_title: 'Premio de las tres últimas',
      p_digits: 'last_three',
      p_rules: [dia],
    })
    expect(tres.error).toBeNull()

    // Y el otro número de la boleta tampoco choca.
    const semanal = await createPrize(owner, raffleId, {
      p_title: 'Premio del número semanal',
      p_number_field: 'weekly_number',
      p_rules: [dia],
    })
    expect(semanal.error).toBeNull()
  })

  it('J7-02b: sin días compartidos no hay conflicto, aunque todo lo demás sea igual', async () => {
    const raffleId = await newRaffle(`Premios sin cruce ${Date.now().toString(36)}`)
    await prizeOf(owner, raffleId, { p_title: `Premio de un día` })
    const { error } = await createPrize(owner, raffleId, { p_title: `Premio de otro día` })
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
      p_reward_mode: 'fixed',
      p_reward_options: dinero(500000),
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [rule({ start_date: pastMonday, end_date: addDays(pastMonday, 4) })],
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
      p_reward_mode: 'fixed',
      p_reward_options: dinero(500000),
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [rule({ start_date: dia, end_date: dia, weekdays: [2] })],
    })
    expect(error).toBeNull()
  })

  it('J8-03: con la hora original pero sin la oficial, el corte efectivo no se conoce y no se guarda (D-203, I-125)', async () => {
    const { rows: prizeRows } = await db.query<{ id: string; current_version_id: string }>(
      `select id, current_version_id from raffle_prizes where raffle_id = $1 and status = 'active'`,
      [activeRaffle],
    )
    const premio = prizeRows[0]!
    const dia = addDays(pastMonday, 2) // miércoles: Meta

    // Sin la hora oficial el sorteo pudo haberse adelantado y jugado ya: el corte
    // es la menor de las dos horas, y con una sola no se decide (0062).
    const { rows } = await db.query<{ id: string }>(
      `insert into lottery_draw_schedules (lottery_code, draw_number, reference_date, schedule_status,
         original_scheduled_at, official_scheduled_at)
       values ('meta', $1, $2, 'schedule_unverified', $3::timestamptz, null)
       returning id`,
      [`PRZ-U-${Date.now()}`, dia, `${dia}T22:30:00-05:00`],
    )
    createdSchedules.push(rows[0]!.id)

    const { error } = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.id,
      p_expected_version_id: premio.current_version_id,
      p_title: 'Premio de la rifa activa',
      p_category: 'daily',
      p_reward_mode: 'fixed',
      p_reward_options: dinero(500000),
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [rule({ start_date: dia, end_date: dia, weekdays: [3] })],
    })
    expect(error?.message).toContain('hora oficial del sorteo')
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

  it('J9-02: el historial sale de las versiones, con actor, recompensa y vigencia', async () => {
    const dia = diaLibre()
    const premio = await prizeOf(admin, draftRaffle, {
      p_title: 'Premio con historial',
      p_rules: [dia],
    })
    await admin.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
      p_title: 'Premio con historial',
      p_category: 'special',
      p_reward_mode: 'fixed',
      p_reward_options: dinero(500000),
      p_number_field: 'daily_number',
      p_digits: 'last_three',
      p_rules: [dia],
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

    // La recompensa viaja con su modo y sus opciones; la vigencia, con sus dos
    // fechas: desde cuándo y hasta cuándo aplicaba esa versión (D-201).
    expect(historial[0]!.reward_mode).toBe('fixed')
    expect(historial[0]!.reward_options).toEqual([{ description: null, amount: 500000 }])
    expect(historial[0]!.starts_on).toBe(dia.start_date)
    expect(historial[0]!.ends_on).toBe(dia.end_date)
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
      // Fija: lo único que cambia en la primera publicación tiene que ser el nombre.
      p_reward_options: dinero(500000),
    })

    const soloNombre = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
      p_title: 'Premio material, con otro nombre',
      p_category: 'daily',
      p_reward_mode: 'fixed',
      p_reward_options: dinero(500000),
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [
        rule({ start_date: addDays(futureMonday, 35), end_date: addDays(futureMonday, 39) }),
      ],
    })
    const v2 = (soloNombre.data as unknown as PrizeResult[])[0]!
    expect(await notificationsOf(v2.version_id)).toHaveLength(0)

    const conRecompensa = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: v2.version_id,
      p_title: 'Premio material, con otro nombre',
      p_category: 'daily',
      p_reward_mode: 'fixed',
      p_reward_options: dinero(750000),
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [
        rule({ start_date: addDays(futureMonday, 35), end_date: addDays(futureMonday, 39) }),
      ],
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
        'id, position, status, current:raffle_prize_versions!raffle_prizes_current_version_fk(title, digits, number_field, reward_mode, reward:raffle_prize_reward_options(position, description, amount), rules:raffle_prize_schedule_rules(start_date, end_date, weekdays, lottery_mode, lottery_code))',
      )
      .eq('raffle_id', draftRaffle)
      .eq('status', 'active')
      .order('position')

    expect(error).toBeNull()
    const primero = (data ?? [])[0] as unknown as {
      current: { title: string; rules: unknown[]; reward: unknown[] } | null
    }
    expect(primero?.current?.title).toBeTruthy()
    expect(Array.isArray(primero?.current?.rules)).toBe(true)
    expect((primero?.current?.reward ?? []).length).toBeGreaterThan(0)
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
      'raffle_prize_reward_options',
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
    // 0061 (D-203): las piezas del motor de coincidencias.
    'raffle_prize_draw_prizes',
    // 0062 (D-203, Decisión 9): la definición canónica del corte efectivo.
    'raffle_prize_draw_cutoff',
    'raffle_prize_insert_version',
    'raffle_prize_is_material',
    'raffle_prize_lock',
    'raffle_prize_manageable_raffle',
    'raffle_prize_normalized_reward',
    'raffle_prize_normalized_rules',
    'raffle_prize_notify',
    'raffle_prize_reward_json',
    'raffle_prize_reward_options_immutable',
    'raffle_prize_rule_covers_weekdays',
    'raffle_prize_rule_dates',
    'raffle_prize_rules_json',
    'raffle_prize_validity',
    'raffle_prize_version_problem',
    'raffle_prize_versions_at',
    'raffle_prize_versions_require_reward',
    'raffle_prize_weekdays_valid',
    'raffles_guard_prize_config',
    // 0063 (D-204): la transición de una rifa existente. La operación solo la
    // ejecuta la service role; sus piezas, nadie.
    'transition_raffle_prize_mode',
    'raffle_prize_transition_apply',
    'raffle_prize_transition_configuration',
    'raffle_prize_transition_open',
    'raffle_prize_transition_pending_draws',
    'raffle_prize_transition_played_occurrence',
    'raffle_prize_transitions_guard',
    'raffle_prize_lottery_label',
    'raffle_prize_raffle_status_phrase',
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

  it('J11-04: las cuatro tablas tienen RLS forzada y solo políticas de SELECT', async () => {
    const { rows } = await db.query<{ relname: string; forzada: boolean }>(
      `select c.relname, c.relforcerowsecurity as forzada
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in ('raffle_prizes', 'raffle_prize_versions', 'raffle_prize_schedule_rules',
                            'raffle_prize_reward_options')`,
    )
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.forzada)).toBe(true)

    const { rows: politicas } = await db.query<{ cmd: string }>(
      `select cmd from pg_policies
        where schemaname = 'public'
          and tablename in ('raffle_prizes', 'raffle_prize_versions', 'raffle_prize_schedule_rules',
                            'raffle_prize_reward_options')`,
    )
    expect(politicas).toHaveLength(4)
    expect(politicas.every((p) => p.cmd === 'SELECT')).toBe(true)
  })

  it('J11-05: `authenticated` solo tiene SELECT y `anon` no tiene nada', async () => {
    const { rows } = await db.query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in ('raffle_prizes', 'raffle_prize_versions', 'raffle_prize_schedule_rules',
                             'raffle_prize_reward_options')
          and grantee in ('authenticated', 'anon')
          and privilege_type <> 'SELECT'`,
    )
    expect(rows).toEqual([])

    const { rows: anon } = await db.query<{ n: number }>(
      `select count(*)::int as n from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in ('raffle_prizes', 'raffle_prize_versions', 'raffle_prize_schedule_rules',
                             'raffle_prize_reward_options')
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
                            'raffle_prize_schedule_rules_position_key', 'notifications_raffle_prize_once',
                            'raffle_prize_reward_options_position_key')
        order by indexname`,
    )
    expect(rows.map((r) => r.indexname)).toEqual([
      'notifications_raffle_prize_once',
      'raffle_prize_reward_options_position_key',
      'raffle_prize_schedule_rules_position_key',
      'raffle_prize_versions_number_key',
      'raffle_prizes_position_key',
    ])
  })

  it('J11-08: las rifas del seed siguen en modo heredado (BR-J13)', async () => {
    // Desde D-202 una rifa NUEVA puede nacer `configurable`, así que contar
    // todas las configurables de la base ya no dice nada: las deja cualquier
    // suite que cree una. Lo que sigue siendo cierto es que **ninguna rifa que
    // ya existía cambió de modo**, y eso se comprueba sobre las del seed.
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from raffles where prize_mode <> 'legacy' and id = any ($1::uuid[])`,
      [[ctx.demoRaffle.id, ctx.controlRaffle.id]],
    )
    expect(rows[0]!.n).toBe(0)
  })
})

// =============================================================================
describe('J12 — las opciones de recompensa, en la base (BR-J02, D-201)', () => {
  /** Las cuatro alternativas del premio mayor del 21 de diciembre. */
  const ALTERNATIVAS = [
    { description: 'Camioneta KIA', amount: null },
    { description: 'Renault Alaskan 2023', amount: 20000000 },
    { description: null, amount: 120000000 },
    { description: 'Renault Logan Zen público 2023', amount: 70000000 },
  ]

  async function opcionesDe(versionId: string) {
    const { rows } = await db.query<{
      position: number
      description: string | null
      amount: string | null
    }>(
      `select position, description, amount from raffle_prize_reward_options
        where version_id = $1 order by position`,
      [versionId],
    )
    return rows.map((r) => ({
      position: r.position,
      description: r.description,
      amount: r.amount === null ? null : Number(r.amount),
    }))
  }

  it('J12-01: un premio único en dinero guarda una sola opción', async () => {
    const premio = await prizeOf(owner, draftRaffle, { p_title: 'Premio único en dinero' })
    expect(await opcionesDe(premio.version_id)).toEqual([
      { position: 1, description: null, amount: 500000 },
    ])
  })

  it('J12-02: cuatro alternativas excluyentes, en su orden y sin reordenar', async () => {
    const premio = await prizeOf(owner, draftRaffle, {
      p_title: 'Premio mayor con alternativas',
      p_category: 'main',
      p_reward_mode: 'winner_choice',
      p_reward_options: ALTERNATIVAS,
    })

    const { rows } = await db.query<{ reward_mode: string }>(
      `select reward_mode from raffle_prize_versions where id = $1`,
      [premio.version_id],
    )
    expect(rows[0]!.reward_mode).toBe('winner_choice')

    expect(await opcionesDe(premio.version_id)).toEqual(
      ALTERNATIVAS.map((option, index) => ({ ...option, position: index + 1 })),
    )
  })

  it('J12-03: «Premio único» con más de una alternativa se rechaza', async () => {
    const { error } = await createPrize(owner, draftRaffle, {
      p_title: 'Premio único mal puesto',
      p_reward_options: ALTERNATIVAS.slice(0, 2),
    })
    expect(error?.message).toContain('una sola recompensa')
  })

  it('J12-04: «Alternativas a elegir» con una sola se rechaza', async () => {
    const { error } = await createPrize(owner, draftRaffle, {
      p_title: 'Alternativa solitaria',
      p_reward_mode: 'winner_choice',
      p_reward_options: [ALTERNATIVAS[0]],
    })
    expect(error?.message).toContain('al menos dos')
  })

  it('J12-05: dos alternativas iguales se rechazan', async () => {
    const { error } = await createPrize(owner, draftRaffle, {
      p_title: 'Alternativas repetidas',
      p_reward_mode: 'winner_choice',
      p_reward_options: [ALTERNATIVAS[0], ALTERNATIVAS[0]],
    })
    expect(error?.message).toContain('dos alternativas iguales')
  })

  it('J12-06: más de seis alternativas se rechazan', async () => {
    const { error } = await createPrize(owner, draftRaffle, {
      p_title: 'Demasiadas alternativas',
      p_reward_mode: 'winner_choice',
      p_reward_options: Array.from({ length: 7 }, (_, index) => ({
        description: null,
        amount: (index + 1) * 1000,
      })),
    })
    expect(error?.message).toContain('máximo 6 alternativas')
  })

  it('J12-07: la semántica la impone la base, no solo la RPC', async () => {
    // Una versión `fixed` con dos opciones no puede existir ni escribiéndola
    // directo: el disparador diferido la rechaza al COMMIT.
    const premio = await prizeOf(owner, draftRaffle, { p_title: 'Premio con dos opciones' })

    await db.query('begin')
    // La inserción pasa: el disparador es DIFERIDO, como el de los períodos.
    await db.query(
      `insert into raffle_prize_reward_options (organization_id, version_id, position, description, amount)
       values ($1, $2, 2, null, 999000)`,
      [ctx.demoOrg.id, premio.version_id],
    )
    // Lo que no pasa es el COMMIT.
    await expect(db.query('commit')).rejects.toThrow(/una sola recompensa/)

    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from raffle_prize_reward_options where version_id = $1`,
      [premio.version_id],
    )
    expect(rows[0]!.n).toBe(1)
  })

  it('J12-08: las opciones de una versión anterior son inmutables, también para la service role', async () => {
    const premio = await prizeOf(owner, draftRaffle, { p_title: 'Premio con recompensa inmutable' })

    await expect(
      db.query(`update raffle_prize_reward_options set amount = 1 where version_id = $1`, [
        premio.version_id,
      ]),
    ).rejects.toThrow(/no se modifica ni se borra/)

    await expect(
      db.query(`delete from raffle_prize_reward_options where version_id = $1`, [
        premio.version_id,
      ]),
    ).rejects.toThrow(/no se modifica ni se borra/)
  })

  it('J12-09: cambiar de recompensa única a alternativas guarda las dos versiones enteras', async () => {
    const dia = diaLibre()
    const premio = await prizeOf(owner, draftRaffle, {
      p_title: 'Premio que gana alternativas',
      p_rules: [dia],
    })

    const { data, error } = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
      p_title: 'Premio que gana alternativas',
      p_category: 'daily',
      p_reward_mode: 'winner_choice',
      p_reward_options: ALTERNATIVAS,
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [dia],
    })
    expect(error).toBeNull()

    const nueva = (data as unknown as PrizeResult[])[0]!
    expect(await opcionesDe(premio.version_id)).toHaveLength(1)
    expect(await opcionesDe(nueva.version_id)).toHaveLength(4)
  })

  it('J12-10: archivar y restaurar copian la recompensa tal cual', async () => {
    const premio = await prizeOf(owner, draftRaffle, {
      p_title: 'Premio que se archiva con alternativas',
      p_reward_mode: 'winner_choice',
      p_reward_options: ALTERNATIVAS,
    })

    const archivado = await owner.rpc('archive_raffle_prize', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
    })
    const archivada = (archivado.data as unknown as PrizeResult[])[0]!
    expect(await opcionesDe(archivada.version_id)).toEqual(await opcionesDe(premio.version_id))

    const restaurado = await owner.rpc('restore_raffle_prize', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: archivada.version_id,
    })
    const restaurada = (restaurado.data as unknown as PrizeResult[])[0]!
    expect(await opcionesDe(restaurada.version_id)).toEqual(await opcionesDe(premio.version_id))
  })

  it('J12-11: cambiar una alternativa es material y avisa; el orden también', async () => {
    const dia = rule({
      start_date: addDays(futureMonday, 49),
      end_date: addDays(futureMonday, 53),
    })
    const premio = await prizeOf(owner, activeRaffle, {
      p_title: 'Premio con alternativas que cambian',
      p_reward_mode: 'winner_choice',
      p_reward_options: ALTERNATIVAS,
      p_rules: [dia],
    })

    const { data } = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: premio.prize_id,
      p_expected_version_id: premio.version_id,
      p_title: 'Premio con alternativas que cambian',
      p_category: 'daily',
      p_reward_mode: 'winner_choice',
      p_reward_options: [...ALTERNATIVAS].reverse(),
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [dia],
    })
    const v2 = (data as unknown as PrizeResult[])[0]!
    expect(v2.version_number).toBe(2)
    expect((await notificationsOf(v2.version_id)).length).toBeGreaterThan(0)
  })

  it('J12-12: la bitácora del personal lleva el modo y las alternativas, y nada de cartera', async () => {
    const premio = await prizeOf(owner, draftRaffle, {
      p_title: 'Premio auditado con alternativas',
      p_reward_mode: 'winner_choice',
      p_reward_options: ALTERNATIVAS,
    })

    const { data, error } = await owner.rpc('admin_audit_log', {
      p_entity_type: 'raffle_prize',
      p_entity_id: premio.prize_id,
    })
    expect(error).toBeNull()

    const filas = data as unknown as Array<{ new_values: Record<string, unknown> }>
    expect(filas).toHaveLength(1)
    expect(filas[0]!.new_values.reward_mode).toBe('winner_choice')
    expect(filas[0]!.new_values.reward_options).toEqual(ALTERNATIVAS)

    const texto = JSON.stringify(filas)
    for (const prohibido of ['client_id', 'sale_price', 'paid_amount']) {
      expect(texto).not.toContain(prohibido)
    }
  })

  it('J12-13: no queda ninguna versión con una recompensa que no cuadre (la migración 0059)', async () => {
    const { rows } = await db.query<{ rotas: number; viejas: number }>(
      `select
         (select count(*)::int from raffle_prize_versions v
           where (select count(*) from raffle_prize_reward_options o where o.version_id = v.id)
                 <> case v.reward_mode when 'fixed' then 1 else
                      greatest((select count(*) from raffle_prize_reward_options o where o.version_id = v.id), 2)
                    end
              or (v.reward_mode = 'winner_choice'
                  and (select count(*) from raffle_prize_reward_options o where o.version_id = v.id) < 2)
         ) as rotas,
         (select count(*)::int from information_schema.columns
           where table_name = 'raffle_prize_versions'
             and column_name in ('reward_type', 'reward_amount', 'reward_description')) as viejas`,
    )
    expect(rows[0]!.rotas).toBe(0)
    // La representación anterior se retiró: no hay dos fuentes de verdad.
    expect(rows[0]!.viejas).toBe(0)
  })
})

// =============================================================================
describe('J13 — los seis premios confirmados, por las RPC de la aplicación (D-201, D-204)', () => {
  /**
   * La rifa de diciembre de 2026 con los SEIS premios confirmados: el premio
   * diario cierra el **27 de noviembre** y el de fin de semana, el **28**, así
   * que ninguno alcanza los especiales de diciembre. El premio mayor del 21 es
   * UN premio con cuatro alternativas excluyentes, y el de tres cifras de ese
   * mismo día convive con él a propósito.
   *
   * La configuración NO se escribe aquí otra vez: es `confirmedRafflePrizes`,
   * la misma que usa la transición (D-204). Hasta el 2026-09-16 esta prueba
   * cargaba un SÉPTIMO premio —número semanal, lunes 14, Cundinamarca, $400.000—
   * que fue solo un ejemplo del dueño; ese caso vive ahora en J3-03 como ejemplo
   * genérico.
   *
   * El INICIO del diario y del de fin de semana es el primer sorteo pendiente el
   * día de la transición. Esta rifa es un borrador que no la necesita: aquí
   * empiezan el primer lunes y el primer sábado de noviembre.
   */
  let rifa: string

  const creados: Record<string, PrizeResult> = {}
  const CLAVES = ['diario', 'finDeSemana', 'mayor', 'tresCifras', 'especialSemanal', 'quince']

  it('J13-01: los seis premios confirmados se crean sin un solo conflicto', async () => {
    rifa = await newRaffle(`Premios aceptación ${Date.now().toString(36)}`, {
      start: '2026-11-01',
      end: '2026-12-31',
    })

    const premios = confirmedRafflePrizes({ dailyStart: '2026-11-02', saturdayStart: '2026-11-07' })
    expect(premios).toHaveLength(6)

    for (const [index, premio] of premios.entries()) {
      creados[CLAVES[index]!] = await prizeOf(owner, rifa, {
        p_title: premio.title,
        p_category: premio.category,
        p_reward_mode: premio.reward_mode,
        p_reward_options: premio.reward_options,
        p_number_field: premio.number_field,
        p_digits: premio.digits,
        p_rules: premio.rules,
      })
    }

    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from raffle_prizes where raffle_id = $1 and status = 'active'`,
      [rifa],
    )
    expect(rows[0]!.n).toBe(6)
  })

  it('J13-02: la rifa se activa con esa configuración', async () => {
    await expect(
      db.query(`update raffles set status = 'active' where id = $1`, [rifa]),
    ).resolves.toBeTruthy()
  })

  it('J13-03: cada premio dice desde cuándo y hasta cuándo aplica', async () => {
    const { data } = await owner.rpc('raffle_prize_history', {
      p_prize_id: creados.diario!.prize_id,
    })
    const diario = (data as unknown as Array<Record<string, unknown>>)[0]!
    expect(diario.starts_on).toBe('2026-11-02')
    expect(diario.ends_on).toBe('2026-11-27')

    const { data: fin } = await owner.rpc('raffle_prize_history', {
      p_prize_id: creados.finDeSemana!.prize_id,
    })
    const finDeSemana = (fin as unknown as Array<Record<string, unknown>>)[0]!
    expect(finDeSemana.starts_on).toBe('2026-11-07')
    expect(finDeSemana.ends_on).toBe('2026-11-28')
  })

  it('J13-04: alargar el premio diario hasta diciembre choca con el principal el 21', async () => {
    const { error } = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: creados.diario!.prize_id,
      p_expected_version_id: creados.diario!.version_id,
      p_title: 'Premio diario',
      p_category: 'daily',
      p_reward_mode: 'fixed',
      p_reward_options: dinero(500000),
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [
        rule({ start_date: '2026-11-02', end_date: '2026-12-31', weekdays: [1, 2, 3, 4, 5] }),
      ],
    })

    expect(error?.message).toContain('Premio diario')
    expect(error?.message).toContain('Premio principal')
    expect(error?.message).toContain('21/12/2026')
  })

  it('J13-05: alargar el de fin de semana hasta diciembre choca el sábado 5', async () => {
    const { error } = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: creados.finDeSemana!.prize_id,
      p_expected_version_id: creados.finDeSemana!.version_id,
      p_title: 'Premio fin de semana',
      p_category: 'weekly',
      p_reward_mode: 'fixed',
      p_reward_options: dinero(2000000),
      p_number_field: 'weekly_number',
      p_digits: 'four',
      p_rules: [
        rule({
          start_date: '2026-11-07',
          end_date: '2026-12-26',
          weekdays: [6],
          lottery_mode: 'fixed',
          lottery_code: 'boyaca',
        }),
      ],
    })

    expect(error?.message).toContain('Premio fin de semana')
    expect(error?.message).toContain('Premio especial semanal')
    expect(error?.message).toContain('05/12/2026')
  })

  it('J13-06: restaurar un premio que quedó en conflicto también se rechaza', async () => {
    // Se archiva el principal, se alarga el diario hasta fin de año —ahora sí
    // cabe— y al devolver el principal a vigente el cruce reaparece.
    const archivado = await owner.rpc('archive_raffle_prize', {
      p_prize_id: creados.mayor!.prize_id,
      p_expected_version_id: creados.mayor!.version_id,
    })
    expect(archivado.error).toBeNull()
    const archivada = (archivado.data as unknown as PrizeResult[])[0]!

    const alargado = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: creados.diario!.prize_id,
      p_expected_version_id: creados.diario!.version_id,
      p_title: 'Premio diario',
      p_category: 'daily',
      p_reward_mode: 'fixed',
      p_reward_options: dinero(500000),
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [
        rule({ start_date: '2026-11-02', end_date: '2026-12-31', weekdays: [1, 2, 3, 4, 5] }),
      ],
    })
    expect(alargado.error).toBeNull()

    const { error } = await owner.rpc('restore_raffle_prize', {
      p_prize_id: creados.mayor!.prize_id,
      p_expected_version_id: archivada.version_id,
    })
    expect(error?.message).toContain('Premio principal')
    expect(error?.message).toContain('21/12/2026')
  })
})

// =============================================================================
describe('J14 — una rifa nueva puede nacer configurable (BR-J13, D-202, `0060`)', () => {
  /** Los campos mínimos de una rifa, con nombre propio de esta suite. */
  function nuevaRifa(nombre: string, overrides: Record<string, unknown> = {}) {
    return {
      organization_id: ctx.demoOrg.id,
      name: nombre,
      ticket_price: 120000,
      start_date: futureMonday,
      end_date: addDays(futureMonday, 90),
      created_by: ctx.ids.owner,
      prize_mode: 'configurable' as const,
      ...overrides,
    }
  }

  async function crear(client: Client, nombre: string, overrides: Record<string, unknown> = {}) {
    const { data, error } = await client
      .from('raffles')
      .insert(nuevaRifa(nombre, overrides) as never)
      .select('id, status, prize_mode')
      .maybeSingle()
    if (data?.id) createdRaffles.push(data.id)
    return { data, error }
  }

  it('J14-01: el Dueño crea una rifa configurable, y nace en borrador', async () => {
    const { data, error } = await crear(owner, `Configurable dueño ${Date.now().toString(36)}`)
    expect(error).toBeNull()
    expect(data).toMatchObject({ status: 'draft', prize_mode: 'configurable' })
  })

  it('J14-02: el Administrador también, por la capacidad y no por su rol', async () => {
    const { data, error } = await crear(admin, `Configurable admin ${Date.now().toString(36)}`)
    expect(error).toBeNull()
    expect(data).toMatchObject({ status: 'draft', prize_mode: 'configurable' })
  })

  it('J14-03: un vendedor no crea rifas, configurables ni de las otras', async () => {
    const configurable = await crear(seller, `Configurable vendedor ${Date.now().toString(36)}`)
    expect(configurable.error).not.toBeNull()

    const heredada = await crear(seller, `Heredada vendedor ${Date.now().toString(36)}`, {
      prize_mode: 'legacy',
    })
    expect(heredada.error).not.toBeNull()
  })

  it('J14-04: otra organización responde lo mismo que una que no existe', async () => {
    const ajena = await crear(owner, `Configurable ajena ${Date.now().toString(36)}`, {
      organization_id: ctx.controlOrg.id,
    })
    const inexistente = await crear(owner, `Configurable inexistente ${Date.now().toString(36)}`, {
      organization_id: '11111111-2222-4333-8444-555555555555',
    })

    expect(ajena.error).not.toBeNull()
    expect(inexistente.error).not.toBeNull()
    expect(ajena.error?.message).toBe(inexistente.error?.message)
  })

  it('J14-05: una rifa configurable no puede nacer activa', async () => {
    const { error } = await crear(owner, `Configurable activa ${Date.now().toString(36)}`, {
      status: 'active',
    })
    expect(error?.message).toContain('nace en borrador')
  })

  it('J14-06: sin la capacidad, la base lo rechaza aunque la sesión sea de personal', async () => {
    // La capacidad se comprueba en PostgreSQL con la identidad de la sesión: se
    // ejecuta el mismo INSERT con las credenciales de un vendedor, que no la
    // tiene. La política de RLS lo corta antes, y el disparador después: las dos
    // capas dicen que no.
    const { rows } = await db.query<{ puede: boolean }>(
      `select has_org_capability($1, 'raffles.prizes.manage') as puede`,
      [ctx.demoOrg.id],
    )
    expect(rows[0]!.puede).toBe(false) // sin sesión, nadie tiene capacidad
  })

  it('J14-07: convertir una rifa heredada sigue prohibido para cualquier sesión', async () => {
    const { error } = await owner
      .from('raffles')
      .update({ prize_mode: 'configurable' } as never)
      .eq('id', legacyRaffle)
    expect(error?.message).toContain('no se cambia desde la aplicación')

    await expect(
      db.query(`update raffles set prize_mode = 'configurable' where id = $1`, [legacyRaffle]),
    ).resolves.toBeTruthy()

    // Se deja como estaba: esta suite no cambia el modo de ninguna rifa ajena.
    await db.query(`update raffles set prize_mode = 'legacy' where id = $1`, [legacyRaffle])
  })

  it('J14-08: una rifa configurable creada así no se activa sin premios', async () => {
    const { data } = await crear(owner, `Configurable sin premios ${Date.now().toString(36)}`)
    await expect(
      db.query(`update raffles set status = 'active' where id = $1`, [data!.id]),
    ).rejects.toThrow(/al menos un premio/)
  })
})
