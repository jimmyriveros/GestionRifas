/**
 * Suscripciones Web Push — ETAPA 4
 * (BR-V04, BR-V05, BR-V06; migración `0053`, D-187, D-190).
 *
 * Lo que se prueba aquí es lo que ninguna pantalla puede garantizar: que nadie
 * vea los dispositivos de otro, que las claves con las que se le puede escribir
 * a un teléfono no salgan de la base, y —el caso que de verdad importa en este
 * producto— que **activar los avisos en un móvil compartido cambie de dueño la
 * suscripción en vez de duplicarla**.
 *
 * Ninguna prueba usa la service role para el acto probado (D-043): cada una
 * inicia sesión como un usuario real y opera con la clave pública. La service
 * role solo prepara, comprueba los CHECK —que sí se aplican con ella— y limpia.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  DB_URL,
  anonClient,
  loadSeedContext,
  signInAs,
  USERS,
  type Client,
} from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let db: PgClient

let seller1: Client
let seller2: Client
let owner: Client

/** Una suscripción con la forma exacta que entrega `PushSubscription.toJSON()`. */
function device(n: number) {
  return {
    p_endpoint: `https://fcm.googleapis.com/fcm/send/dispositivo-de-prueba-${n}-${'x'.repeat(20)}`,
    // 65 bytes en base64url son 87 caracteres.
    p_p256dh: `B${'Ab3_-'.repeat(17)}x`,
    // 16 bytes en base64url son 22.
    p_auth: `${'aB9_-'.repeat(4)}xy`,
  }
}

async function limpiar() {
  await ctx.svc.from('push_subscriptions').delete().neq('endpoint', '')
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
  owner = await signInAs(USERS.owner)
})

afterAll(async () => {
  await limpiar()
  await db.end()
})

beforeEach(async () => {
  await limpiar()
})

// =============================================================================
describe('P — registrar y quitar el propio dispositivo (BR-V06)', () => {
  it('P-01: el dispositivo queda registrado y su dueño lo vuelve a leer', async () => {
    const { data, error } = await seller1.rpc('upsert_push_subscription', {
      ...device(1),
      p_user_agent: 'Mozilla/5.0 (Android)',
    })
    expect(error).toBeNull()
    expect(data!.profile_id).toBe(ctx.ids.seller1)
    expect(data!.revoked_at).toBeNull()

    const { data: mios } = await seller1.from('push_subscriptions').select('endpoint')
    expect(mios).toHaveLength(1)
  })

  it('P-02: activar dos veces desde el mismo navegador no duplica', async () => {
    await seller1.rpc('upsert_push_subscription', device(1))
    await seller1.rpc('upsert_push_subscription', device(1))

    const { data } = await seller1.from('push_subscriptions').select('endpoint')
    expect(data).toHaveLength(1)
  })

  it('P-03: dos dispositivos distintos de la misma persona conviven', async () => {
    await seller1.rpc('upsert_push_subscription', device(1))
    await seller1.rpc('upsert_push_subscription', device(2))

    const { data } = await seller1.from('push_subscriptions').select('endpoint')
    expect(data).toHaveLength(2)
  })

  /**
   * EL CASO QUE IMPORTA EN ESTE PRODUCTO.
   *
   * Dos vendedores compartiendo un teléfono es lo normal aquí, y el navegador
   * entrega siempre el mismo endpoint para el mismo dispositivo. La fila cambia
   * de dueño: el anterior deja de recibir ahí.
   */
  it('P-04: en un teléfono compartido, activar CAMBIA el dueño y no duplica', async () => {
    await seller1.rpc('upsert_push_subscription', device(1))
    const { error } = await seller2.rpc('upsert_push_subscription', device(1))
    expect(error).toBeNull()

    const { data: total } = await ctx.svc.from('push_subscriptions').select('profile_id')
    expect(total).toHaveLength(1)
    expect(total![0]!.profile_id).toBe(ctx.ids.seller2)

    // Y el primero ya no lo ve: para él, ese teléfono dejó de ser suyo.
    const { data: delPrimero } = await seller1.from('push_subscriptions').select('endpoint')
    expect(delPrimero).toEqual([])
  })

  it('P-05: reasignar limpia el historial del dispositivo anterior', async () => {
    await seller1.rpc('upsert_push_subscription', device(1))
    await ctx.svc
      .from('push_subscriptions')
      .update({
        success_count: 7,
        failure_count: 3,
        revoked_at: new Date().toISOString(),
        revoked_reason: 'gone',
      })
      .eq('profile_id', ctx.ids.seller1)

    const { data } = await seller2.rpc('upsert_push_subscription', device(1))
    expect(data!.success_count).toBe(0)
    expect(data!.failure_count).toBe(0)
    expect(data!.revoked_at).toBeNull()
    expect(data!.revoked_reason).toBeNull()
  })

  it('P-06: quitarlo borra la fila, y repetirlo no es un error', async () => {
    await seller1.rpc('upsert_push_subscription', device(1))

    const { data: primera } = await seller1.rpc('delete_push_subscription', {
      p_endpoint: device(1).p_endpoint,
    })
    expect(primera).toBe(true)

    const { data: segunda, error } = await seller1.rpc('delete_push_subscription', {
      p_endpoint: device(1).p_endpoint,
    })
    expect(error).toBeNull()
    expect(segunda).toBe(false)

    const { data: quedan } = await ctx.svc.from('push_subscriptions').select('endpoint')
    expect(quedan).toEqual([])
  })
})

// =============================================================================
describe('P — aislamiento: los dispositivos son de quien los registró', () => {
  beforeEach(async () => {
    await seller1.rpc('upsert_push_subscription', device(1))
  })

  it('P-07: otro vendedor no ve el dispositivo ajeno', async () => {
    const { data } = await seller2.from('push_subscriptions').select('endpoint')
    expect(data).toEqual([])
  })

  it('P-08: el Dueño tampoco: no es un dato de la organización', async () => {
    const { data } = await owner.from('push_subscriptions').select('endpoint')
    expect(data).toEqual([])
  })

  it('P-09: un visitante sin sesión no lee nada', async () => {
    const { data, error } = await anonClient().from('push_subscriptions').select('endpoint')
    expect(data ?? []).toEqual([])
    if (error) expect(error.code).toBeDefined()
  })

  it('P-10: nadie borra el dispositivo de otro, aunque sepa su endpoint', async () => {
    const { data } = await seller2.rpc('delete_push_subscription', {
      p_endpoint: device(1).p_endpoint,
    })
    // Misma respuesta que si no existiera: quien pruebe direcciones no aprende
    // cuáles están registradas.
    expect(data).toBe(false)

    const { data: sigue } = await ctx.svc.from('push_subscriptions').select('endpoint')
    expect(sigue).toHaveLength(1)
  })

  it('P-11: no se puede escribir directo en la tabla', async () => {
    const insert = await seller1.from('push_subscriptions').insert({
      profile_id: ctx.ids.seller1,
      endpoint: device(9).p_endpoint,
      p256dh: device(9).p_p256dh,
      auth: device(9).p_auth,
    })
    expect(insert.error?.code).toBe('42501')

    const update = await seller1
      .from('push_subscriptions')
      .update({ endpoint: 'https://otro.example.com/x'.padEnd(40, 'y') })
      .eq('profile_id', ctx.ids.seller1)
    expect(update.error?.code).toBe('42501')

    const del = await seller1.from('push_subscriptions').delete().eq('profile_id', ctx.ids.seller1)
    expect(del.error?.code).toBe('42501')
  })

  it('P-12: la bitácora NO guarda el endpoint ni las claves (BR-D04)', async () => {
    const { rows } = await db.query<{ old_values: unknown; new_values: unknown }>(
      `select old_values, new_values from audit_logs
        where action = 'push_subscription.enable'
        order by created_at desc limit 1`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.old_values).toBeNull()
    expect(rows[0]!.new_values).toBeNull()

    // Y en toda la bitácora no aparece ningún endpoint, por si alguien añadiera
    // un volcado «de diagnóstico» mañana.
    const { rows: fugas } = await db.query<{ n: number }>(
      `select count(*)::int as n from audit_logs
        where coalesce(old_values::text, '') || coalesce(new_values::text, '') like '%fcm.googleapis.com%'`,
    )
    expect(fugas[0]!.n).toBe(0)
  })
})

// =============================================================================
describe('P — forma de una suscripción: lo que la base no deja escribir', () => {
  async function insertar(campos: Record<string, unknown>) {
    const base = {
      profile_id: ctx.ids.seller1,
      endpoint: device(5).p_endpoint,
      p256dh: device(5).p_p256dh,
      auth: device(5).p_auth,
      ...campos,
    }
    const cols = Object.keys(base)
    return db
      .query(
        `insert into push_subscriptions (${cols.join(', ')})
         values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
        Object.values(base),
      )
      .then(
        () => null,
        (error: Error) => error.message,
      )
  }

  it('P-13: un endpoint que no es https se rechaza', async () => {
    expect(await insertar({ endpoint: `http://fcm.example.com/${'a'.repeat(40)}` })).toMatch(
      /endpoint_https/,
    )
  })

  it('P-14: una clave con la forma equivocada se rechaza', async () => {
    expect(await insertar({ p256dh: 'corta' })).toMatch(/p256dh_shape/)
    expect(await insertar({ auth: 'x' })).toMatch(/auth_shape/)
    // Y nada de caracteres fuera de base64url.
    expect(await insertar({ auth: `${'aB9_-'.repeat(4)}++` })).toMatch(/auth_shape/)
  })

  it('P-15: revocada sin motivo es imposible, y al revés también', async () => {
    expect(await insertar({ revoked_at: new Date().toISOString() })).toMatch(/revoked_coherent/)
    expect(await insertar({ revoked_reason: 'gone' })).toMatch(/revoked_coherent/)
  })

  it('P-16: el endpoint es único en TODA la tabla, no por persona', async () => {
    expect(await insertar({})).toBeNull()
    expect(await insertar({ profile_id: ctx.ids.seller2 })).toMatch(
      /push_subscriptions_endpoint_key/,
    )
  })
})

// =============================================================================
describe('catálogo: lo que trajo la 0053', () => {
  it('la tabla tiene RLS forzada y una sola política, de SELECT', async () => {
    const { rows: clase } = await db.query<{
      relrowsecurity: boolean
      relforcerowsecurity: boolean
    }>(
      `select relrowsecurity, relforcerowsecurity from pg_class where relname = 'push_subscriptions'`,
    )
    expect(clase[0]!.relrowsecurity).toBe(true)
    expect(clase[0]!.relforcerowsecurity).toBe(true)

    const { rows: politicas } = await db.query<{ cmd: string }>(
      `select cmd from pg_policies where tablename = 'push_subscriptions'`,
    )
    expect(politicas).toHaveLength(1)
    expect(politicas[0]!.cmd).toBe('SELECT')
  })

  it('authenticated solo tiene SELECT, y anon no tiene nada', async () => {
    const { rows } = await db.query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_name = 'push_subscriptions' and grantee in ('authenticated', 'anon')
        order by grantee, privilege_type`,
    )
    expect(rows).toEqual([{ grantee: 'authenticated', privilege_type: 'SELECT' }])
  })

  it('las dos RPC son ejecutables por authenticated y NUNCA por anon', async () => {
    const { rows } = await db.query<{ proname: string; auth: boolean; anonimo: boolean }>(
      `select p.proname,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anonimo
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('upsert_push_subscription', 'delete_push_subscription')
        order by p.proname`,
    )
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.auth, row.proname).toBe(true)
      expect(row.anonimo, row.proname).toBe(false)
    }
  })

  /**
   * La tabla NO lleva `organization_id`, y es deliberado (D-190): una
   * suscripción es de una persona y es transporte, no un dato de negocio de
   * ninguna organización. Esta prueba existe para que quien lo «arregle» mañana
   * tenga que leer la decisión primero.
   */
  it('la suscripción es de una PERSONA: no hay columna de organización', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'push_subscriptions'
          and column_name = 'organization_id'`,
    )
    expect(rows).toEqual([])
  })
})
