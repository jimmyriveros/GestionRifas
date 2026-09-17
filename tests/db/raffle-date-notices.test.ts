/**
 * El aviso de las fechas de una rifa activa (BR-R12, D-206, migración `0064`).
 *
 * Cambiar la fecha de inicio o la de fin de una rifa ACTIVA avisa, en la MISMA
 * transacción, a cada membresía activa de su organización —menos a quien hizo
 * el cambio— y deja una fila semántica en la bitácora. Lo que se prueba es lo
 * que solo la base puede garantizar: a quién llega y a quién no, que el aviso y
 * el cambio van juntos o no van, que un reintento o dos cambios iguales a la vez
 * no duplican nada, que guardar las mismas fechas no avisa y que el aviso no
 * lleva nada de la cartera.
 *
 * Es el camino que usará la rifa real para extender su fin al 21/12/2026: el
 * aviso no depende de ningún script, sale de la base venga el cambio de donde
 * venga.
 *
 * Las rifas son propias (2064) y se borran al final. La service role hace el
 * cambio «del sistema»; el Dueño, con su sesión, el de la pantalla de editar; y
 * cada persona lee su campana con la suya.
 */
import { randomUUID } from 'node:crypto'

import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { notificationHref, notificationMessage } from '@/features/notifications/text'

import {
  DB_URL,
  loadSeedContext,
  SEED_PASSWORD,
  serviceClient,
  signInAs,
  USERS,
  type Client,
} from './helpers'

const PREFIJO = 'BR-R12 fechas'
const stamp = Date.now().toString(36)
const KIND = 'raffle.dates_changed'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let db: PgClient
let svc: Client
let owner: Client
let admin: Client
let seller1: Client
let otherOrgOwner: Client
let inactivo = ''

type Aviso = {
  recipient_profile_id: string
  organization_id: string
  actor_profile_id: string | null
  entity_type: string
  entity_id: string
  data: Record<string, unknown>
}

async function nuevaRifa(
  nombre: string,
  opciones: { estado?: 'draft' | 'active' | 'closed'; desde?: string; hasta?: string } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into raffles (organization_id, name, ticket_price, start_date, end_date, created_by, prize_mode)
     values ($1, $2, 120000, $3, $4, $5, 'legacy')
     returning id`,
    [
      ctx.demoOrg.id,
      `${PREFIJO} ${nombre} ${stamp}`,
      opciones.desde ?? '2064-07-27',
      opciones.hasta ?? '2064-11-01',
      ctx.ids.owner,
    ],
  )
  const id = rows[0]!.id
  const estado = opciones.estado ?? 'active'
  if (estado !== 'draft') {
    await db.query(`update raffles set status = 'active' where id = $1`, [id])
    if (estado === 'closed')
      await db.query(`update raffles set status = 'closed' where id = $1`, [id])
  }
  return id
}

async function avisos(raffleId: string): Promise<Aviso[]> {
  const { rows } = await db.query<Aviso>(
    `select recipient_profile_id, organization_id, actor_profile_id, entity_type, entity_id, data
       from notifications
      where kind = $1 and (data ->> 'raffle_id')::uuid = $2
      order by recipient_profile_id`,
    [KIND, raffleId],
  )
  return rows
}

async function bitacoraDeFechas(raffleId: string) {
  const { rows } = await db.query<{
    actor_profile_id: string | null
    old_values: Record<string, unknown>
    new_values: Record<string, unknown>
  }>(
    `select actor_profile_id, old_values, new_values from audit_logs
      where entity_id = $1 and action = 'raffle.dates_change' order by id`,
    [raffleId],
  )
  return rows
}

/** Las membresías que deben recibir el aviso: activas, con perfil activo, de la organización. */
async function membresiasActivas(): Promise<string[]> {
  const { rows } = await db.query<{ profile_id: string }>(
    `select m.profile_id from memberships m
       join profiles p on p.id = m.profile_id
       join organizations o on o.id = m.organization_id
      where m.organization_id = $1 and m.is_active and p.is_active and o.is_active
      order by m.profile_id`,
    [ctx.demoOrg.id],
  )
  return rows.map((row) => row.profile_id)
}

async function fechas(raffleId: string) {
  const { rows } = await db.query<{ desde: string; hasta: string }>(
    `select start_date::text as desde, end_date::text as hasta from raffles where id = $1`,
    [raffleId],
  )
  return rows[0]!
}

async function limpiar(): Promise<void> {
  await db.query('begin')
  try {
    await db.query(`set local session_replication_role = replica`)
    const { rows } = await db.query<{ id: string }>(`select id from raffles where name like $1`, [
      `${PREFIJO} %`,
    ])
    const ids = rows.map((row) => row.id)
    await db.query(
      `delete from notifications where kind = $1 and (data ->> 'raffle_id')::uuid = any ($2::uuid[])`,
      [KIND, ids],
    )
    await db.query(
      `delete from audit_logs where entity_id = any ($1::uuid[])
          or (entity_type = 'raffle_prize' and (coalesce(new_values, old_values) ->> 'raffle_id')::uuid = any ($1::uuid[]))`,
      [ids],
    )
    await db.query(
      `delete from raffle_prize_reward_options where version_id in (
         select id from raffle_prize_versions where raffle_id = any ($1::uuid[]))`,
      [ids],
    )
    await db.query(
      `delete from raffle_prize_schedule_rules where version_id in (
         select id from raffle_prize_versions where raffle_id = any ($1::uuid[]))`,
      [ids],
    )
    await db.query(`delete from raffle_prizes where raffle_id = any ($1::uuid[])`, [ids])
    await db.query(`delete from raffle_prize_versions where raffle_id = any ($1::uuid[])`, [ids])
    await db.query(`delete from raffles where id = any ($1::uuid[])`, [ids])
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
  ;[owner, admin, seller1, otherOrgOwner] = await Promise.all([
    signInAs(USERS.owner),
    signInAs(USERS.admin),
    signInAs(USERS.seller1),
    signInAs(USERS.otherOrgOwner),
  ])

  // Una membresía INACTIVA de la organización: no recibe el aviso.
  const { data, error } = await ctx.svc.auth.admin.createUser({
    email: `fechas-inactiva-${stamp}@demo.test`,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Vendedora Inactiva de Fechas', phone: '3001234567' },
  })
  if (error) throw error
  inactivo = data.user.id
  await db.query(
    `insert into memberships (organization_id, profile_id, role, is_active) values ($1, $2, 'seller', false)`,
    [ctx.demoOrg.id, inactivo],
  )
}, 60_000)

afterAll(async () => {
  await limpiar()
  if (inactivo) {
    await db.query('begin')
    await db.query(`set local session_replication_role = replica`)
    await db.query(`delete from notifications where recipient_profile_id = $1`, [inactivo])
    await db.query(`delete from audit_logs where entity_id = $1 or actor_profile_id = $1`, [
      inactivo,
    ])
    await db.query(`delete from memberships where profile_id = $1`, [inactivo])
    await db.query('commit')
    await ctx.svc.auth.admin.deleteUser(inactivo)
  }
  await Promise.all([owner, admin, seller1, otherOrgOwner].map((c) => c?.auth.signOut()))
  await db.end()
}, 60_000)

// =============================================================================
describe('R1 — a quién llega el aviso', () => {
  it('R1-01: el sistema extiende el fin de una rifa activa: UN aviso por membresía activa, en la misma operación que el cambio', async () => {
    const rifa = await nuevaRifa('sistema')
    const { error } = await svc.from('raffles').update({ end_date: '2064-12-21' }).eq('id', rifa)
    expect(error).toBeNull()

    const recibidos = await avisos(rifa)
    const esperadas = await membresiasActivas()
    expect(recibidos.map((a) => a.recipient_profile_id)).toEqual(esperadas)
    expect(esperadas).toEqual(
      expect.arrayContaining([ctx.ids.owner, ctx.ids.admin, ctx.ids.seller1, ctx.ids.seller2]),
    )
    expect(recibidos.map((a) => a.recipient_profile_id)).not.toContain(inactivo)
    expect(recibidos.map((a) => a.recipient_profile_id)).not.toContain(ctx.ids.otherOrgSeller)
    expect(new Set(recibidos.map((a) => a.recipient_profile_id)).size).toBe(recibidos.length)

    // UN evento: todos comparten el identificador del cambio, sin actor (el sistema).
    expect(new Set(recibidos.map((a) => a.entity_id)).size).toBe(1)
    for (const aviso of recibidos) {
      expect(aviso).toMatchObject({
        organization_id: ctx.demoOrg.id,
        actor_profile_id: null,
        entity_type: 'raffle_date_change',
      })
    }

    // La bitácora: el `raffle.update` de siempre y UNA fila semántica con el conteo.
    const semantica = await bitacoraDeFechas(rifa)
    expect(semantica).toHaveLength(1)
    expect(semantica[0]).toEqual({
      actor_profile_id: null,
      old_values: { start_date: '2064-07-27', end_date: '2064-11-01' },
      new_values: {
        start_date: '2064-07-27',
        end_date: '2064-12-21',
        change_id: recibidos[0]!.entity_id,
        notified: esperadas.length,
      },
    })
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from audit_logs
        where entity_id = $1 and action = 'raffle.update' and new_values ? 'end_date'`,
      [rifa],
    )
    expect(rows[0]!.n).toBe(1)
  })

  it('R1-02: desde la pantalla, con la sesión del Dueño: avisa a todos menos a él, y cada quien lee solo el suyo', async () => {
    const rifa = await nuevaRifa('dueño')
    const { error } = await owner
      .from('raffles')
      .update({ start_date: '2064-08-03' })
      .eq('id', rifa)
    expect(error).toBeNull()

    const recibidos = await avisos(rifa)
    const esperadas = (await membresiasActivas()).filter((id) => id !== ctx.ids.owner)
    expect(recibidos.map((a) => a.recipient_profile_id)).toEqual(esperadas)
    expect(recibidos.every((a) => a.actor_profile_id === ctx.ids.owner)).toBe(true)
    expect((await bitacoraDeFechas(rifa))[0]).toMatchObject({
      actor_profile_id: ctx.ids.owner,
      new_values: { start_date: '2064-08-03', notified: esperadas.length },
    })

    // La campana de cada uno, con su propia sesión (RLS): el Administrador y el
    // vendedor ven el suyo; el Dueño, que lo hizo, y otra organización, nada.
    for (const [cliente, cuantos] of [
      [admin, 1],
      [seller1, 1],
      [owner, 0],
      [otherOrgOwner, 0],
    ] as const) {
      const { data, error: lectura } = await cliente
        .from('notifications')
        .select('recipient_profile_id, kind, data')
        .eq('kind', KIND)
        .eq('data->>raffle_id', rifa)
      expect(lectura).toBeNull()
      expect(data).toHaveLength(cuantos)
    }
    const { data: suyo } = await seller1
      .from('notifications')
      .select('recipient_profile_id')
      .eq('kind', KIND)
      .eq('data->>raffle_id', rifa)
    expect(suyo).toEqual([{ recipient_profile_id: ctx.ids.seller1 }])
  })

  it('R1-03: un vendedor no cambia las fechas, así que no puede provocar el aviso', async () => {
    const rifa = await nuevaRifa('vendedor')
    await seller1.from('raffles').update({ end_date: '2064-12-21' }).eq('id', rifa)
    expect(await fechas(rifa)).toEqual({ desde: '2064-07-27', hasta: '2064-11-01' })
    expect(await avisos(rifa)).toEqual([])
  })
})

// =============================================================================
describe('R2 — cuándo NO avisa', () => {
  it('R2-01: guardar las mismas fechas —un reintento— no avisa otra vez ni escribe otra fila', async () => {
    const rifa = await nuevaRifa('reintento')
    await svc.from('raffles').update({ end_date: '2064-12-21' }).eq('id', rifa)
    const primero = await avisos(rifa)
    expect(primero.length).toBeGreaterThan(0)

    // Lo que haría la pantalla al repetir el envío: todas las columnas, iguales.
    for (let intento = 0; intento < 2; intento += 1) {
      const { error } = await owner
        .from('raffles')
        .update({
          start_date: '2064-07-27',
          end_date: '2064-12-21',
          name: `${PREFIJO} reintento ${stamp}`,
        })
        .eq('id', rifa)
      expect(error).toBeNull()
    }
    expect(await avisos(rifa)).toEqual(primero)
    expect(await bitacoraDeFechas(rifa)).toHaveLength(1)
  })

  it('R2-02: cambiar otra cosa de una rifa activa no avisa', async () => {
    const rifa = await nuevaRifa('otra cosa')
    const { error } = await owner
      .from('raffles')
      .update({
        ticket_price: 150_000,
        description: 'Otra descripción',
        allow_seller_ticket_creation: true,
      })
      .eq('id', rifa)
    expect(error).toBeNull()
    expect(await avisos(rifa)).toEqual([])
    expect(await bitacoraDeFechas(rifa)).toEqual([])
  })

  it('R2-03: un borrador, una rifa cerrada o una que se cierra en el mismo cambio no avisan', async () => {
    const borrador = await nuevaRifa('borrador', { estado: 'draft' })
    await svc.from('raffles').update({ end_date: '2064-12-21' }).eq('id', borrador)
    expect((await fechas(borrador)).hasta).toBe('2064-12-21')

    const cerrada = await nuevaRifa('cerrada', { estado: 'closed' })
    await db.query(`update raffles set end_date = '2064-12-21' where id = $1`, [cerrada])
    expect((await fechas(cerrada)).hasta).toBe('2064-12-21')

    const cerrandose = await nuevaRifa('cerrándose')
    await db.query(`update raffles set end_date = '2064-12-21', status = 'closed' where id = $1`, [
      cerrandose,
    ])

    for (const rifa of [borrador, cerrada, cerrandose]) {
      expect(await avisos(rifa)).toEqual([])
      expect(await bitacoraDeFechas(rifa)).toEqual([])
    }
  })
})

// =============================================================================
describe('R3 — atómico y sin duplicados', () => {
  it('R3-01: si el cambio de fechas se rechaza, no queda ningún aviso; si se deshace, tampoco', async () => {
    // Una rifa configurable ACTIVA con un premio el 21/10/2064: acortarla antes
    // de esa fecha la rechaza su disparador (BR-J13), y el aviso va en la misma
    // transacción.
    const rifa = await db.query<{ id: string }>(
      `insert into raffles (organization_id, name, ticket_price, start_date, end_date, created_by, prize_mode)
       values ($1, $2, 120000, '2064-07-27', '2064-11-01', $3, 'configurable') returning id`,
      [ctx.demoOrg.id, `${PREFIJO} configurable ${stamp}`, ctx.ids.owner],
    )
    const id = rifa.rows[0]!.id
    const premio = randomUUID()
    await db.query('begin')
    await db.query(
      `select raffle_prize_insert_version($1, $2, $3, gen_random_uuid(), 1, null, 'active', 'Premio de octubre',
         'daily', 'fixed', '[{"description": null, "amount": 1000}]'::jsonb, 'daily_number', 'four', null,
         '[{"start_date": "2064-10-21", "end_date": "2064-10-21", "weekdays": [2], "lottery_mode": "corresponding", "lottery_code": null}]'::jsonb,
         null)`,
      [ctx.demoOrg.id, id, premio],
    )
    await db.query(
      `insert into raffle_prizes (id, organization_id, raffle_id, status, position, current_version_id)
       select $1, $2, $3, 'active', 1, v.id from raffle_prize_versions v where v.prize_id = $1`,
      [premio, ctx.demoOrg.id, id],
    )
    await db.query('commit')
    await db.query(`update raffles set status = 'active' where id = $1`, [id])

    const { error } = await owner.from('raffles').update({ end_date: '2064-10-01' }).eq('id', id)
    expect(error?.message).toContain('tiene fechas fuera de las nuevas fechas de la rifa')
    expect(await fechas(id)).toEqual({ desde: '2064-07-27', hasta: '2064-11-01' })
    expect(await avisos(id)).toEqual([])
    expect(await bitacoraDeFechas(id)).toEqual([])

    // Un cambio válido dentro de una transacción que se deshace: dentro existen
    // los avisos; fuera, no queda ninguno.
    await db.query('begin')
    await db.query(`update raffles set end_date = '2064-12-21' where id = $1`, [id])
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from notifications where kind = $1 and (data ->> 'raffle_id')::uuid = $2`,
      [KIND, id],
    )
    expect(rows[0]!.n).toBe((await membresiasActivas()).length)
    await db.query('rollback')
    expect(await avisos(id)).toEqual([])
    expect(await fechas(id)).toEqual({ desde: '2064-07-27', hasta: '2064-11-01' })
  })

  it('R3-02: dos cambios iguales a la vez: uno avisa y el otro, que ya encuentra las fechas nuevas, no', async () => {
    const rifa = await nuevaRifa('a la vez')
    const una = new PgClient({ connectionString: DB_URL })
    const otra = new PgClient({ connectionString: DB_URL })
    await Promise.all([una.connect(), otra.connect()])
    try {
      await una.query('begin')
      await una.query(`update raffles set end_date = '2064-12-21' where id = $1`, [rifa])

      // La segunda espera el cerrojo de la fila y, al entrar, ya no cambia nada.
      let terminoAntes = false
      const segunda = otra
        .query(`update raffles set end_date = '2064-12-21' where id = $1`, [rifa])
        .then(() => {
          terminoAntes = true
        })
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(terminoAntes).toBe(false)
      await una.query('commit')
      await segunda
    } finally {
      await Promise.all([una.end(), otra.end()])
    }

    const recibidos = await avisos(rifa)
    expect(recibidos.map((a) => a.recipient_profile_id)).toEqual(await membresiasActivas())
    expect(new Set(recibidos.map((a) => a.entity_id)).size).toBe(1)
    expect(await bitacoraDeFechas(rifa)).toHaveLength(1)
  })

  it('R3-03: dos cambios DISTINTOS son dos avisos, uno por cambio y persona', async () => {
    const rifa = await nuevaRifa('dos cambios')
    await svc.from('raffles').update({ end_date: '2064-12-21' }).eq('id', rifa)
    await svc.from('raffles').update({ end_date: '2064-12-26' }).eq('id', rifa)
    const recibidos = await avisos(rifa)
    const personas = await membresiasActivas()
    expect(recibidos).toHaveLength(personas.length * 2)
    expect(new Set(recibidos.map((a) => a.entity_id)).size).toBe(2)
    expect(await bitacoraDeFechas(rifa)).toHaveLength(2)

    // El índice único: el mismo evento no se escribe dos veces a la misma persona.
    const [aviso] = recibidos
    await expect(
      db.query(
        `insert into notifications (organization_id, recipient_profile_id, kind, entity_type, entity_id, data)
         values ($1, $2, $3, 'raffle_date_change', $4, '{}'::jsonb)`,
        [ctx.demoOrg.id, aviso!.recipient_profile_id, KIND, aviso!.entity_id],
      ),
    ).rejects.toThrow(/notifications_raffle_dates_once/)
  })
})

// =============================================================================
describe('R4 — lo que dice y lo que no', () => {
  it('R4-01: el aviso identifica la rifa y sus fechas, y nada de clientes, ventas, pagos ni cartera', async () => {
    const rifa = await nuevaRifa('privacidad')
    await svc.from('raffles').update({ end_date: '2064-12-21' }).eq('id', rifa)
    const [aviso] = await avisos(rifa)

    expect(aviso!.data).toEqual({
      raffle_id: rifa,
      raffle_name: `${PREFIJO} privacidad ${stamp}`,
      previous_start_date: '2064-07-27',
      previous_end_date: '2064-11-01',
      start_date: '2064-07-27',
      end_date: '2064-12-21',
    })
    const texto = JSON.stringify([aviso!.data, await bitacoraDeFechas(rifa)])
    for (const prohibido of [
      'client',
      'sale',
      'price',
      'paid',
      'payment',
      'balance',
      'amount',
      ctx.clients.ana.id,
    ]) {
      expect(texto).not.toContain(prohibido)
    }

    // El texto de la campana: la rifa y la fecha nueva, sin enlace.
    expect(notificationMessage(KIND, aviso!.data)).toBe(
      `Cambiaron las fechas de ${PREFIJO} privacidad ${stamp}: ahora termina el 21 de diciembre de 2064.`,
    )
    expect(notificationHref(KIND)).toBeNull()
  })

  it('R4-02: el tipo nuevo cabe en el CHECK de avisos y tiene su índice de idempotencia', async () => {
    const { rows } = await db.query<{ check: string; indice: string }>(
      `select pg_get_constraintdef(c.oid) as check,
              (select indexdef from pg_indexes where indexname = 'notifications_raffle_dates_once') as indice
         from pg_constraint c where c.conname = 'notifications_kind_check'`,
    )
    expect(rows[0]!.check).toContain(`'raffle.dates_changed'`)
    expect(rows[0]!.indice).toContain('(recipient_profile_id, entity_id)')
    expect(rows[0]!.indice).toContain(`'raffle.dates_changed'`)
  })
})
