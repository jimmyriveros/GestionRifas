/**
 * El despachador de punta a punta — ETAPA 5
 * (BR-V02, BR-V03, BR-V07; D-187, D-191).
 *
 * **Base de datos real, cifrado real, servicio de push de mentira.** Es lo más
 * cerca del camino verdadero que se puede llegar sin mandarle un aviso a un
 * teléfono de alguien: la cola es la de verdad, las RPC son las de verdad, el
 * cuerpo va cifrado con el código de verdad, y lo único sustituido es el
 * `fetch` que habla con Google o con Mozilla.
 *
 * Lo que se comprueba es lo que `TESTING` §4.8 pidió antes de construir nada:
 * que un 201 vacíe la cola, que un 410 revoque sin reintentar, que un 503 se
 * reintente, y que **perder el envío no toque la campana** (BR-V02).
 */
import { Client as PgClient } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { runPushDispatch } from '@/features/push/dispatch'

import { DB_URL, loadSeedContext } from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let db: PgClient

/** Un par VAPID de verdad, generado para la prueba. No es secreto de nadie. */
let vapidPublic: string
let vapidPrivate: string

/** Y un dispositivo con claves válidas: las del ejemplo del RFC 8291. */
const DISPOSITIVO = {
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
}

const PUSH_HOST = 'https://fcm.googleapis.com/'

function endpointDe(n: number) {
  return `https://fcm.googleapis.com/fcm/send/despacho-${n}-${'y'.repeat(20)}`
}

/** Lo que el servicio de push «responde», y lo que recibió. */
type Peticion = { url: string; headers: Record<string, string>; bodyLength: number }
let peticiones: Peticion[] = []

/** El `fetch` de verdad, para dejar pasar todo lo que no es un envío. */
const fetchReal = globalThis.fetch

/**
 * Sustituye el servicio de push, y SOLO el servicio de push.
 *
 * El despachador habla con dos sitios por la misma función: con PostgREST,
 * para tomar la cola y cerrarla, y con Google o Mozilla, para entregar. Un
 * doble que se quede con las dos deja al despachador sin base de datos — que
 * es exactamente lo que pasó al escribir esto por primera vez—. Todo lo que no
 * va a un endpoint de push se le pasa al `fetch` de verdad.
 */
function fakePushService(respuesta: (url: string) => { status: number; statusText?: string }) {
  const doble = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (!url.startsWith(PUSH_HOST)) return fetchReal(input, init)

    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>),
    )
    const body = init?.body as Uint8Array | undefined
    peticiones.push({ url, headers, bodyLength: body?.byteLength ?? 0 })
    const { status, statusText } = respuesta(url)
    return new Response(null, { status, statusText: statusText ?? '' })
  })
  return doble
}

/** Lo mismo, para los fallos de red: solo se cae el servicio de push. */
function fakePushNetworkError() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (!url.startsWith(PUSH_HOST)) return fetchReal(input, init)
    peticiones.push({ url, headers: {}, bodyLength: 0 })
    throw new Error('sin red')
  })
}

async function darDeAlta(endpoint: string) {
  await db.query(
    'insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values ($1,$2,$3,$4)',
    [ctx.ids.seller1, endpoint, DISPOSITIVO.p256dh, DISPOSITIVO.auth],
  )
}

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
  const { rows } = await db.query<{ status: string; attempts: number; last_error: string | null }>(
    'select status, attempts, last_error from push_outbox where id = $1',
    [id],
  )
  return rows[0]!
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  const { createECDH } = await import('node:crypto')
  const ecdh = createECDH('prime256v1')
  vapidPublic = ecdh.generateKeys().toString('base64url')
  vapidPrivate = ecdh.getPrivateKey().toString('base64url')

  // El despachador lee el entorno, igual que en producción.
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = vapidPublic
  process.env.VAPID_PRIVATE_KEY = vapidPrivate
  process.env.VAPID_SUBJECT = 'mailto:soporte@ejemplo.com'
})

afterAll(async () => {
  await db.query('delete from push_outbox')
  await db.query("delete from notifications where kind = 'payment_reminder.due'")
  await db.query('delete from push_subscriptions')
  await db.end()
})

beforeEach(async () => {
  peticiones = []
  await db.query('delete from push_outbox')
  await db.query("delete from notifications where kind = 'payment_reminder.due'")
  await db.query('delete from push_subscriptions')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// =============================================================================
describe('D — el camino feliz', () => {
  it('D-01: un 201 vacía la cola y deja la fila enviada', async () => {
    await darDeAlta(endpointDe(1))
    const { outboxId } = await encolar()
    vi.stubGlobal('fetch', fakePushService(() => ({ status: 201 })))

    const resumen = await runPushDispatch()

    expect(resumen.claimed).toBe(1)
    expect(resumen.sent).toBe(1)
    expect(resumen.skipped).toBe(false)
    expect((await estado(outboxId)).status).toBe('sent')
  })

  it('D-02: el envío va CIFRADO y con la cabecera VAPID del RFC', async () => {
    await darDeAlta(endpointDe(1))
    await encolar()
    vi.stubGlobal('fetch', fakePushService(() => ({ status: 201 })))

    await runPushDispatch()

    expect(peticiones).toHaveLength(1)
    const peticion = peticiones[0]!
    expect(peticion.url).toBe(endpointDe(1))
    expect(peticion.headers['Content-Encoding']).toBe('aes128gcm')
    expect(peticion.headers['Content-Type']).toBe('application/octet-stream')
    expect(peticion.headers.TTL).toBe('3600')
    expect(peticion.headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/)
    expect(peticion.headers.Authorization).toContain(vapidPublic)

    // 21 de cabecera + 65 de clave efímera + el texto cifrado y su etiqueta.
    expect(peticion.bodyLength).toBeGreaterThan(21 + 65 + 16)
  })

  it('D-03: a DOS dispositivos de la misma persona les llega a los dos', async () => {
    await darDeAlta(endpointDe(1))
    await darDeAlta(endpointDe(2))
    await encolar()
    vi.stubGlobal('fetch', fakePushService(() => ({ status: 201 })))

    const resumen = await runPushDispatch()

    expect(peticiones).toHaveLength(2)
    // Y es UNA sola fila de cola, no dos.
    expect(resumen.claimed).toBe(1)
    expect(resumen.sent).toBe(1)
  })

  it('D-04: los contadores del dispositivo se mueven', async () => {
    await darDeAlta(endpointDe(1))
    await encolar()
    vi.stubGlobal('fetch', fakePushService(() => ({ status: 201 })))

    await runPushDispatch()

    const { rows } = await db.query<{ success_count: number; last_success_at: string | null }>(
      'select success_count, last_success_at from push_subscriptions where endpoint = $1',
      [endpointDe(1)],
    )
    expect(rows[0]!.success_count).toBe(1)
    expect(rows[0]!.last_success_at).not.toBeNull()
  })
})

// =============================================================================
describe('D — lo que sale mal (BR-V07)', () => {
  it('D-05: un 410 REVOCA la suscripción y no la reintenta', async () => {
    await darDeAlta(endpointDe(1))
    const { outboxId } = await encolar()
    vi.stubGlobal('fetch', fakePushService(() => ({ status: 410 })))

    const resumen = await runPushDispatch()

    expect(resumen.revoked).toBe(1)
    expect(resumen.failed).toBe(1)
    expect(resumen.retried).toBe(0)
    expect((await estado(outboxId)).status).toBe('failed')

    const { rows } = await db.query<{ revoked_at: string | null; revoked_reason: string | null }>(
      'select revoked_at, revoked_reason from push_subscriptions where endpoint = $1',
      [endpointDe(1)],
    )
    expect(rows[0]!.revoked_at).not.toBeNull()
    expect(rows[0]!.revoked_reason).toContain('410')
  })

  it('D-06: un 503 se REINTENTA, y la fila vuelve a la cola', async () => {
    await darDeAlta(endpointDe(1))
    const { outboxId } = await encolar()
    vi.stubGlobal('fetch', fakePushService(() => ({ status: 503 })))

    const resumen = await runPushDispatch()

    expect(resumen.retried).toBe(1)
    const despues = await estado(outboxId)
    expect(despues.status).toBe('queued')
    expect(despues.attempts).toBe(1)
    expect(despues.last_error).toContain('503')
  })

  it('D-07: un 400 NO se reintenta: es culpa nuestra y no la arregla insistir', async () => {
    await darDeAlta(endpointDe(1))
    const { outboxId } = await encolar()
    vi.stubGlobal('fetch', fakePushService(() => ({ status: 400, statusText: 'Bad Request' })))

    await runPushDispatch()
    expect((await estado(outboxId)).status).toBe('failed')
  })

  it('D-08: con DOS dispositivos, uno muerto y otro vivo, la fila SALE', async () => {
    await darDeAlta(endpointDe(1))
    await darDeAlta(endpointDe(2))
    const { outboxId } = await encolar()
    vi.stubGlobal(
      'fetch',
      fakePushService((url) => (url === endpointDe(1) ? { status: 410 } : { status: 201 })),
    )

    const resumen = await runPushDispatch()

    // Al segundo le llegó, así que el aviso salió. Y el primero queda revocado.
    expect(resumen.sent).toBe(1)
    expect(resumen.revoked).toBe(1)
    expect((await estado(outboxId)).status).toBe('sent')
  })

  it('D-09: un fallo de red se reintenta, no se pierde', async () => {
    await darDeAlta(endpointDe(1))
    const { outboxId } = await encolar()
    vi.stubGlobal('fetch', fakePushNetworkError())

    await runPushDispatch()
    expect((await estado(outboxId)).status).toBe('queued')
  })

  /**
   * LA PRUEBA QUE SOSTIENE LA OUTBOX ENTERA (BR-V02).
   *
   * Se fuerza un fallo TOTAL del envío y se comprueba lo único que el contrato
   * promete: que el aviso interno sigue estando.
   */
  it('D-10: aunque se caiga el envío entero, la campana sigue ahí', async () => {
    await darDeAlta(endpointDe(1))
    const { notificationId } = await encolar()
    vi.stubGlobal('fetch', fakePushNetworkError())

    await runPushDispatch()

    const { rows } = await db.query<{ n: number }>(
      'select count(*)::int as n from notifications where id = $1',
      [notificationId],
    )
    expect(rows[0]!.n).toBe(1)
  })

  it('D-11: sin dispositivos, la fila se cierra y NO se toca la red', async () => {
    const { outboxId } = await encolar()
    vi.stubGlobal('fetch', fakePushService(() => ({ status: 201 })))

    const resumen = await runPushDispatch()

    expect(peticiones).toEqual([])
    expect(resumen.failed).toBe(1)
    expect((await estado(outboxId)).status).toBe('failed')
    expect((await estado(outboxId)).last_error).toContain('dispositivo')
  })
})

// =============================================================================
describe('D — sin claves configuradas', () => {
  it('D-12: no envía nada Y NO TOCA LA COLA', async () => {
    await darDeAlta(endpointDe(1))
    const { outboxId } = await encolar()

    const publicaOriginal = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    vi.stubGlobal('fetch', fakePushService(() => ({ status: 201 })))

    try {
      const resumen = await runPushDispatch()
      expect(resumen.skipped).toBe(true)
      expect(peticiones).toEqual([])

      // Dejar la cola intacta es lo importante: el día que se configuren las
      // claves sale todo lo que estaba esperando, en vez de haberse consumido.
      const despues = await estado(outboxId)
      expect(despues.status).toBe('queued')
      expect(despues.attempts).toBe(0)
    } finally {
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = publicaOriginal
    }
  })
})
