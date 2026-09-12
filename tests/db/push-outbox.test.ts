/**
 * La cola de avisos y su máquina de estados — ETAPA 5
 * (BR-V02, BR-V07; migración `0054`, D-187, D-191).
 *
 * Lo que se prueba aquí es lo que el contrato pidió antes de construir nada:
 * que **la campana no dependa de esto**, que un fallo se reintente con
 * retroceso y que un 404 o un 410 maten la suscripción sin reintentarla.
 *
 * Todo con `service_role`, y esta vez no es una excepción sino lo correcto:
 * `push_outbox` **no la lee nadie con sesión** a propósito (es transporte), y el
 * despachador entra exactamente así.
 */
import { Client as PgClient } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { DB_URL, loadSeedContext, signInAs, USERS, type Client } from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let db: PgClient
let seller1: Client

function device(n: number) {
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/cola-de-prueba-${n}-${'x'.repeat(20)}`,
    p256dh: `B${'Ab3_-'.repeat(17)}x`,
    auth: `${'aB9_-'.repeat(4)}xy`,
  }
}

/** Deja una campana y su fila de cola, como las deja el motor. */
async function encolar(): Promise<{ outboxId: string; notificationId: string }> {
  const { rows } = await db.query<{ id: string }>(
    `insert into notifications (organization_id, recipient_profile_id, kind, data)
     values ($1, $2, 'payment_reminder.due', '{}'::jsonb) returning id`,
    [ctx.demoOrg.id, ctx.ids.seller1],
  )
  const notificationId = rows[0]!.id
  const { rows: outbox } = await db.query<{ id: string }>(
    `insert into push_outbox (notification_id, payload)
     values ($1, jsonb_build_object('kind', 'payment_reminder.due')) returning id`,
    [notificationId],
  )
  return { outboxId: outbox[0]!.id, notificationId }
}

async function estado(id: string) {
  const { rows } = await db.query<{
    status: string
    attempts: number
    last_error: string | null
    next_attempt_at: string
    sent_at: string | null
  }>('select status, attempts, last_error, next_attempt_at, sent_at from push_outbox where id = $1', [
    id,
  ])
  return rows[0]!
}

async function limpiar() {
  await db.query('delete from push_outbox')
  await db.query("delete from notifications where kind = 'payment_reminder.due'")
  await db.query('delete from push_subscriptions')
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  seller1 = await signInAs(USERS.seller1)
})

afterAll(async () => {
  await limpiar()
  await db.end()
})

beforeEach(async () => {
  await limpiar()
})

// =============================================================================
describe('O — la cola es transporte, y no la lee nadie con sesión', () => {
  it('O-01: `authenticated` no tiene NINGÚN privilegio sobre push_outbox', async () => {
    const { rows } = await db.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
        where table_name = 'push_outbox' and grantee in ('authenticated', 'anon')`,
    )
    expect(rows).toEqual([])
  })

  /**
   * Las DOS defensas, y las dos importan.
   *
   * El privilegio revocado es la que se ve en el catálogo; la RLS sin ninguna
   * política es la que de verdad devuelve cero filas aunque alguien conceda el
   * `SELECT` otra vez por descuido. Esta prueba mira el resultado, que es lo
   * único que un atacante notaría.
   */
  it('O-02: un vendedor con sesión no ve ni una fila', async () => {
    await encolar()
    const { data } = await seller1.from('push_outbox').select('id')
    expect(data ?? []).toEqual([])
  })

  it('O-03: tiene RLS activada y forzada, como todas', async () => {
    const { rows } = await db.query<{ a: boolean; b: boolean }>(
      `select relrowsecurity as a, relforcerowsecurity as b
         from pg_class where relname = 'push_outbox'`,
    )
    expect(rows[0]).toEqual({ a: true, b: true })
  })

  it('O-04: ninguna de sus funciones la ejecuta una sesión (I-078)', async () => {
    const { rows } = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('claim_push_outbox', 'mark_push_outbox_sent',
                            'mark_push_outbox_failed', 'revoke_push_subscription',
                            'mark_push_subscription_sent', 'wake_push_dispatcher',
                            'push_max_attempts', 'push_retry_delay', 'push_claim_timeout')
          and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
               or has_function_privilege('anon', p.oid, 'EXECUTE'))`,
    )
    expect(rows.map((r) => r.proname)).toEqual([])
  })
})

// =============================================================================
describe('O — tomar un lote (BR-V02)', () => {
  it('O-05: devuelve una fila por dispositivo vivo, y marca la cola como enviando', async () => {
    const { outboxId } = await encolar()
    for (const n of [1, 2]) {
      const d = device(n)
      await db.query(
        'insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values ($1,$2,$3,$4)',
        [ctx.ids.seller1, d.endpoint, d.p256dh, d.auth],
      )
    }

    const { rows } = await db.query('select * from claim_push_outbox(10)')
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.outbox_id))).toEqual(new Set([outboxId]))

    const despues = await estado(outboxId)
    expect(despues.status).toBe('sending')
    expect(despues.attempts).toBe(1)
  })

  it('O-06: una suscripción REVOCADA no entra en el lote (BR-V07)', async () => {
    await encolar()
    const d = device(1)
    await db.query(
      `insert into push_subscriptions (profile_id, endpoint, p256dh, auth, revoked_at, revoked_reason)
       values ($1,$2,$3,$4, now(), 'gone')`,
      [ctx.ids.seller1, d.endpoint, d.p256dh, d.auth],
    )

    const { rows } = await db.query('select * from claim_push_outbox(10)')
    // La fila llega igual, pero SIN dispositivo: así el despachador puede
    // cerrarla en vez de dejarla colgada para siempre.
    expect(rows).toHaveLength(1)
    expect(rows[0]!.subscription_id).toBeNull()
  })

  it('O-07: sin ningún dispositivo, la fila llega con las columnas en NULL', async () => {
    const { outboxId } = await encolar()
    const { rows } = await db.query('select * from claim_push_outbox(10)')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.outbox_id).toBe(outboxId)
    expect(rows[0]!.endpoint).toBeNull()
  })

  it('O-08: una fila que todavía no toca no se toma', async () => {
    const { outboxId } = await encolar()
    await db.query("update push_outbox set next_attempt_at = now() + interval '1 hour'")

    const { rows } = await db.query('select * from claim_push_outbox(10)')
    expect(rows).toEqual([])
    expect((await estado(outboxId)).status).toBe('queued')
  })

  it('O-09: el lote se acota', async () => {
    for (let i = 0; i < 3; i += 1) await encolar()
    const { rows } = await db.query('select * from claim_push_outbox(2)')
    expect(new Set(rows.map((r) => r.outbox_id)).size).toBe(2)
  })

  /**
   * La cola se cura sola. Un despachador que se murió con filas en la mano las
   * dejó en `sending`; sin esto se quedarían ahí para siempre y ese aviso no
   * saldría nunca.
   */
  it('O-10: una fila abandonada vuelve a la cola sola', async () => {
    const { outboxId } = await encolar()
    await db.query(
      `update push_outbox set status = 'sending', claimed_at = now() - interval '30 minutes'`,
    )

    const { rows } = await db.query('select * from claim_push_outbox(10)')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.outbox_id).toBe(outboxId)
    // Y el intento se cuenta: la abandonada vuelve a `queued` y el claim la
    // toma otra vez, así que no puede girar indefinidamente.
    expect((await estado(outboxId)).attempts).toBe(1)
  })

  it('O-11: una fila reciente en la mano de otro NO se recupera', async () => {
    await encolar()
    await db.query(
      `update push_outbox set status = 'sending', claimed_at = now() - interval '10 seconds'`,
    )
    const { rows } = await db.query('select * from claim_push_outbox(10)')
    expect(rows).toEqual([])
  })
})

// =============================================================================
describe('O — cerrar una fila (BR-V07)', () => {
  it('O-12: enviada queda enviada, con su fecha', async () => {
    const { outboxId } = await encolar()
    await db.query('select claim_push_outbox(10)')
    await db.query('select mark_push_outbox_sent($1)', [outboxId])

    const despues = await estado(outboxId)
    expect(despues.status).toBe('sent')
    expect(despues.sent_at).not.toBeNull()
    expect(despues.last_error).toBeNull()
  })

  it('O-13: un fallo reintentable vuelve a la cola, MÁS TARDE', async () => {
    const { outboxId } = await encolar()
    await db.query('select * from claim_push_outbox(10)')
    await db.query('select mark_push_outbox_failed($1, $2, true)', [outboxId, 'el servicio dijo 503'])

    const despues = await estado(outboxId)
    expect(despues.status).toBe('queued')
    expect(despues.last_error).toBe('el servicio dijo 503')
    expect(new Date(despues.next_attempt_at).getTime()).toBeGreaterThan(Date.now())
  })

  it('O-14: el retroceso crece: 1, 5 y 25 minutos, con tope de 2 horas', async () => {
    const { rows } = await db.query<{ n: number; d: string }>(
      `select n, push_retry_delay(n)::text as d from generate_series(1, 6) as n`,
    )
    const porIntento = Object.fromEntries(rows.map((r) => [r.n, r.d]))
    expect(porIntento[1]).toBe('00:01:00')
    expect(porIntento[2]).toBe('00:05:00')
    expect(porIntento[3]).toBe('00:25:00')
    expect(porIntento[4]).toBe('02:00:00')
    expect(porIntento[6]).toBe('02:00:00')
  })

  it('O-15: al agotar los intentos se da por perdida, y NO vuelve a la cola', async () => {
    const { outboxId } = await encolar()
    const tope = (await db.query<{ n: number }>('select push_max_attempts() as n')).rows[0]!.n

    for (let i = 0; i < tope; i += 1) {
      await db.query("update push_outbox set next_attempt_at = now() - interval '1 second'")
      await db.query('select * from claim_push_outbox(10)')
      await db.query('select mark_push_outbox_failed($1, $2, true)', [outboxId, 'sigue fallando'])
    }

    const despues = await estado(outboxId)
    expect(despues.status).toBe('failed')
    expect(despues.attempts).toBe(tope)

    // Y ya no la toma nadie más.
    await db.query("update push_outbox set next_attempt_at = now() - interval '1 hour'")
    const { rows } = await db.query('select * from claim_push_outbox(10)')
    expect(rows).toEqual([])
  })

  it('O-16: un fallo NO reintentable se pierde a la primera', async () => {
    const { outboxId } = await encolar()
    await db.query('select * from claim_push_outbox(10)')
    await db.query('select mark_push_outbox_failed($1, $2, false)', [outboxId, 'el cuerpo estaba mal'])

    const despues = await estado(outboxId)
    expect(despues.status).toBe('failed')
    expect(despues.attempts).toBe(1)
  })

  /**
   * LA PRUEBA QUE SOSTIENE BR-V02, y la razón de que la outbox exista.
   */
  it('O-17: perder el envío NO toca la campana', async () => {
    const { outboxId, notificationId } = await encolar()
    await db.query('select * from claim_push_outbox(10)')
    await db.query('select mark_push_outbox_failed($1, $2, false)', [outboxId, 'se cayó todo'])

    const { rows } = await db.query<{ n: number }>(
      'select count(*)::int as n from notifications where id = $1',
      [notificationId],
    )
    expect(rows[0]!.n).toBe(1)
    expect((await estado(outboxId)).status).toBe('failed')

    // Y el vendedor la sigue viendo en su campanita, que es lo único que el
    // contrato promete (BR-V01).
    const { data } = await seller1.from('notifications').select('id').eq('id', notificationId)
    expect(data).toHaveLength(1)
  })
})

// =============================================================================
describe('O — un 404 o un 410 matan la suscripción (BR-V07)', () => {
  it('O-18: revocar la marca, no la borra', async () => {
    const d = device(1)
    await db.query(
      'insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values ($1,$2,$3,$4)',
      [ctx.ids.seller1, d.endpoint, d.p256dh, d.auth],
    )

    const { rows } = await db.query<{ revoke_push_subscription: boolean }>(
      'select revoke_push_subscription($1, $2)',
      [d.endpoint, 'El servicio de push respondió 410.'],
    )
    expect(rows[0]!.revoke_push_subscription).toBe(true)

    const { rows: fila } = await db.query<{
      revoked_at: string | null
      revoked_reason: string | null
      failure_count: number
    }>('select revoked_at, revoked_reason, failure_count from push_subscriptions where endpoint = $1', [
      d.endpoint,
    ])
    // La fila SIGUE ahí: es la evidencia de que ese dispositivo dijo que no.
    expect(fila).toHaveLength(1)
    expect(fila[0]!.revoked_at).not.toBeNull()
    expect(fila[0]!.revoked_reason).toContain('410')
    expect(fila[0]!.failure_count).toBe(1)
  })

  it('O-19: revocar dos veces no vuelve a contar', async () => {
    const d = device(1)
    await db.query(
      'insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values ($1,$2,$3,$4)',
      [ctx.ids.seller1, d.endpoint, d.p256dh, d.auth],
    )
    await db.query('select revoke_push_subscription($1, $2)', [d.endpoint, 'gone'])
    const { rows } = await db.query<{ revoke_push_subscription: boolean }>(
      'select revoke_push_subscription($1, $2)',
      [d.endpoint, 'gone'],
    )
    expect(rows[0]!.revoke_push_subscription).toBe(false)
  })

  it('O-20: la persona la puede volver a activar después (D-190)', async () => {
    const d = device(1)
    await db.query(
      'insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values ($1,$2,$3,$4)',
      [ctx.ids.seller1, d.endpoint, d.p256dh, d.auth],
    )
    await db.query('select revoke_push_subscription($1, $2)', [d.endpoint, 'gone'])

    const { data, error } = await seller1.rpc('upsert_push_subscription', {
      p_endpoint: d.endpoint,
      p_p256dh: d.p256dh,
      p_auth: d.auth,
    })
    expect(error).toBeNull()
    expect(data!.revoked_at).toBeNull()
  })
})

// =============================================================================
describe('O — el motor encola en la MISMA transacción (BR-V02)', () => {
  async function recordatorioVencido(): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `insert into seller_payment_reminders (organization_id, seller_id, weekday, time_of_day)
       values ($1, $2, 3, '19:00') returning id`,
      [ctx.demoOrg.id, ctx.ids.seller1],
    )
    const id = rows[0]!.id
    await db.query(
      `update seller_payment_reminders set next_run_at = now() - interval '10 minutes' where id = $1`,
      [id],
    )
    return id
  }

  beforeEach(async () => {
    await db.query('begin')
  })

  afterEach(async () => {
    await db.query('rollback')
  })

  it('O-21: con un dispositivo vivo, el motor deja la campana Y la fila de cola', async () => {
    const d = device(1)
    await db.query(
      'insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values ($1,$2,$3,$4)',
      [ctx.ids.seller1, d.endpoint, d.p256dh, d.auth],
    )
    await recordatorioVencido()

    expect((await db.query<{ n: number }>('select process_due_payment_reminders() as n')).rows[0]!.n).toBe(1)

    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from push_outbox')
    expect(rows[0]!.n).toBe(1)

    // Y apunta a la campana que se acaba de escribir.
    const { rows: enlace } = await db.query<{ kind: string }>(
      `select n.kind from push_outbox o join notifications n on n.id = o.notification_id`,
    )
    expect(enlace[0]!.kind).toBe('payment_reminder.due')
  })

  /**
   * Sin dispositivos NO se encola. Una fila que nace sin a quién enviarse solo
   * serviría para nacer fallada, y la campana ya está escrita.
   */
  it('O-22: sin ningún dispositivo, hay campana pero NO hay fila de cola', async () => {
    await recordatorioVencido()
    await db.query('select process_due_payment_reminders()')

    const { rows: avisos } = await db.query<{ n: number }>(
      `select count(*)::int as n from notifications where kind = 'payment_reminder.due'`,
    )
    const { rows: cola } = await db.query<{ n: number }>('select count(*)::int as n from push_outbox')
    expect(avisos[0]!.n).toBe(1)
    expect(cola[0]!.n).toBe(0)
  })

  it('O-23: una ocurrencia OMITIDA no encola nada, porque tampoco avisa (BR-S11)', async () => {
    const d = device(1)
    await db.query(
      'insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values ($1,$2,$3,$4)',
      [ctx.ids.seller1, d.endpoint, d.p256dh, d.auth],
    )
    const id = await recordatorioVencido()
    await db.query(
      `update seller_payment_reminders set next_run_at = now() - interval '5 hours' where id = $1`,
      [id],
    )

    await db.query('select process_due_payment_reminders()')
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from push_outbox')
    expect(rows[0]!.n).toBe(0)
  })

  it('O-24: el payload NO lleva nada de nadie: solo el tipo (BR-V05)', async () => {
    const d = device(1)
    await db.query(
      'insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values ($1,$2,$3,$4)',
      [ctx.ids.seller1, d.endpoint, d.p256dh, d.auth],
    )
    await recordatorioVencido()
    await db.query('select process_due_payment_reminders()')

    const { rows } = await db.query<{ payload: Record<string, unknown> }>(
      'select payload from push_outbox',
    )
    expect(Object.keys(rows[0]!.payload)).toEqual(['kind'])
    expect(rows[0]!.payload.kind).toBe('payment_reminder.due')
  })
})

// =============================================================================
describe('catálogo: el cron del despachador', () => {
  it('el job existe, está activo y corre cada minuto', async () => {
    const { rows } = await db.query<{ schedule: string; active: boolean }>(
      `select schedule, active from cron.job where jobname = 'push-dispatch-wake'`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.schedule).toBe('* * * * *')
    expect(rows[0]!.active).toBe(true)
  })

  it('sin secretos en el vault, el toque no hace nada y no revienta', async () => {
    // Es el estado por defecto: el canal es opcional hasta que alguien lo
    // enciende a propósito (D-190, D-191).
    await encolar()
    await expect(db.query('select wake_push_dispatcher()')).resolves.toBeDefined()
  })

  it('con la cola vacía no toca nada, aunque estuviera configurado', async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from push_outbox where status = 'queued' and next_attempt_at <= now()`,
    )
    expect(rows[0]!.n).toBe(0)
    await expect(db.query('select wake_push_dispatcher()')).resolves.toBeDefined()
  })
})
