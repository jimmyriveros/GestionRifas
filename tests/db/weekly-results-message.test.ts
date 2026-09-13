/**
 * El mensaje propio de «Resultados de la semana», en la base (BR-H09, BR-H10;
 * migración 0056, D-197).
 *
 * Lo que se prueba aquí es lo que la pantalla NO puede garantizar: quién puede
 * escribir, sobre quién, qué combinaciones no pueden existir y qué queda en la
 * bitácora. Cada acto probado inicia sesión como un usuario real y opera con la
 * clave pública (D-043). La service role solo prepara, comprueba los CHECK —que
 * sí se aplican con ella— y limpia.
 *
 * Al final se ejerce la MISMA lectura de producción, `getWeeklyResultsMessageSettings`,
 * con sesiones reales: solo se sustituye de dónde sale el cliente de Supabase.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { EMPTY_WEEKLY_RESULTS_MESSAGE_SETTINGS } from '@/features/weekly-results/message'

import {
  anonClient,
  DB_URL,
  loadSeedContext,
  SEED_PASSWORD,
  signInAs,
  USERS,
  type Client,
} from './helpers'

const sesion = vi.hoisted(() => ({ client: null as unknown }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => sesion.client,
}))

const { getWeeklyResultsMessageSettings } = await import('@/features/weekly-results/queries')

const RPC = 'set_seller_weekly_results_message'
const PROPIO = 'Hola, grupo 👋\n\nYa salieron los números de la semana. Revisen su boleta.'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let db: PgClient

let seller1: Client
let seller2: Client
let owner: Client
let admin: Client

/**
 * Un padre y un integrante PROPIOS de esta suite: no se le monta equipo a
 * `vendedor1` ni a `vendedor2`, que comparten otras suites (I-035).
 */
let parentId: string
let parent: Client
let memberId: string
let member: Client
const createdProfileIds: string[] = []

/** Cuántas membresías tenían algo distinto del predeterminado antes de tocar nada. */
let personalizadasAlEmpezar: number

async function createAuthUser(email: string, fullName: string): Promise<string> {
  const { data, error } = await ctx.svc.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: '3001234567' },
  })
  if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`)
  // `createUser` no deja la contraseña usable hasta actualizarla (I-007).
  await ctx.svc.auth.admin.updateUserById(data.user.id, { password: SEED_PASSWORD })
  createdProfileIds.push(data.user.id)
  return data.user.id
}

/** Lo que quedó guardado, leído con la service role: el acto probado no puede ser su propia prueba. */
async function leer(profileId: string) {
  const { data, error } = await ctx.svc
    .from('memberships')
    .select('weekly_results_use_custom_message, weekly_results_custom_message')
    .eq('profile_id', profileId)
    .single()
  if (error) throw error
  return {
    usarPropio: data.weekly_results_use_custom_message,
    texto: data.weekly_results_custom_message,
  }
}

async function restablecer(profileIds: string[]) {
  const { error } = await ctx.svc
    .from('memberships')
    .update({ weekly_results_use_custom_message: false, weekly_results_custom_message: null })
    .in('profile_id', profileIds)
  if (error) throw error
}

/**
 * La RPC, como la llama la aplicación. `p_custom_message` se omite cuando no hay
 * texto: los tipos de la CLI lo declaran `string | undefined`.
 */
function guardar(client: Client, usarPropio: boolean, texto?: string) {
  return client.rpc(RPC, {
    p_use_custom_message: usarPropio,
    ...(texto === undefined ? {} : { p_custom_message: texto }),
  })
}

const PREDETERMINADO = { usarPropio: false, texto: null }

beforeAll(async () => {
  ctx = await loadSeedContext()
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  const { rows } = await db.query<{ n: number }>(`
    select count(*)::int as n
    from memberships
    where weekly_results_use_custom_message or weekly_results_custom_message is not null
  `)
  personalizadasAlEmpezar = rows[0]!.n

  ;[seller1, seller2, owner, admin] = await Promise.all([
    signInAs(USERS.seller1),
    signInAs(USERS.seller2),
    signInAs(USERS.owner),
    signInAs(USERS.admin),
  ])

  const stamp = Date.now().toString(36)

  const parentEmail = `resultados-padre-${stamp}@demo.test`
  parentId = await createAuthUser(parentEmail, 'Padre Resultados')
  const { error: parentError } = await ctx.svc
    .from('memberships')
    .insert({ organization_id: ctx.demoOrg.id, profile_id: parentId, role: 'seller' })
  if (parentError) throw parentError
  parent = await signInAs(parentEmail)

  const memberEmail = `resultados-equipo-${stamp}@demo.test`
  memberId = await createAuthUser(memberEmail, 'Integrante Resultados')
  const { error: memberError } = await ctx.svc.from('memberships').insert({
    organization_id: ctx.demoOrg.id,
    profile_id: memberId,
    role: 'seller',
    parent_seller_id: parentId,
    invited_by: parentId,
  })
  if (memberError) throw memberError
  member = await signInAs(memberEmail)
})

afterAll(async () => {
  await restablecer([ctx.ids.seller1, ctx.ids.seller2, ctx.ids.owner, ctx.ids.admin])
  if (createdProfileIds.length > 0) {
    // El integrante antes que su padre: la FK del equipo es `on delete restrict`.
    await ctx.svc.from('memberships').delete().eq('profile_id', memberId)
    await ctx.svc.from('memberships').delete().in('profile_id', createdProfileIds)
    for (const id of createdProfileIds) {
      await ctx.svc.auth.admin.deleteUser(id)
    }
  }
  await db.end()
})

// =============================================================================
describe('WM — las columnas, y lo que la migración NO cambió', () => {
  it('WM-01: nacen en `false` y NULL, sin índice ni valor escrito a mano', async () => {
    const { rows } = await db.query(`
      select column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'memberships'
        and column_name in ('weekly_results_use_custom_message', 'weekly_results_custom_message')
      order by column_name
    `)
    expect(rows).toEqual([
      {
        column_name: 'weekly_results_custom_message',
        data_type: 'text',
        is_nullable: 'YES',
        column_default: null,
      },
      {
        column_name: 'weekly_results_use_custom_message',
        data_type: 'boolean',
        is_nullable: 'NO',
        column_default: 'false',
      },
    ])
  })

  it('WM-02: las membresías existentes siguen con el predeterminado, sin UPDATE masivo', async () => {
    expect(personalizadasAlEmpezar).toBe(0)
    // Y una membresía nueva nace igual.
    expect(await leer(parentId)).toEqual(PREDETERMINADO)
  })
})

// =============================================================================
describe('WM — un vendedor guarda SU mensaje', () => {
  it('WM-03: lo escribe, recortado por fuera, con sus saltos de línea y emojis', async () => {
    const { data, error } = await guardar(seller1, true, `   ${PROPIO}   `)
    expect(error).toBeNull()
    expect(data).toEqual([
      { weekly_results_use_custom_message: true, weekly_results_custom_message: PROPIO },
    ])
    expect(await leer(ctx.ids.seller1)).toEqual({ usarPropio: true, texto: PROPIO })
  })

  it('WM-04: apagar el interruptor conserva el texto', async () => {
    await guardar(seller1, true, PROPIO)
    const { data, error } = await guardar(seller1, false, PROPIO)
    expect(error).toBeNull()
    expect(data?.[0]).toEqual({
      weekly_results_use_custom_message: false,
      weekly_results_custom_message: PROPIO,
    })
    expect(await leer(ctx.ids.seller1)).toEqual({ usarPropio: false, texto: PROPIO })
  })

  it('WM-05: vaciarlo a propósito guarda NULL, lo mande vacío, en espacios o sin mandarlo', async () => {
    for (const texto of ['', '     ', undefined]) {
      await guardar(seller1, true, PROPIO)
      const { data, error } = await guardar(seller1, false, texto)
      expect(error, String(texto)).toBeNull()
      expect(data?.[0]?.weekly_results_custom_message, String(texto)).toBeNull()
      expect(await leer(ctx.ids.seller1)).toEqual(PREDETERMINADO)
    }
  })

  it('WM-06: 1.000 caracteres de PostgreSQL caben, aunque sean emojis', async () => {
    const { error } = await guardar(seller1, true, '🎉'.repeat(1000))
    expect(error).toBeNull()
    expect((await leer(ctx.ids.seller1)).texto).toHaveLength(2000) // unidades UTF-16
    await restablecer([ctx.ids.seller1])
  })
})

// =============================================================================
describe('WM — lo que la base NO deja escribir', () => {
  it('WM-07: «usar mi propio mensaje» sin mensaje, con la frase de la pantalla', async () => {
    await restablecer([ctx.ids.seller1])
    for (const texto of [undefined, '', '    ']) {
      const { error } = await guardar(seller1, true, texto)
      expect(error?.code, String(texto)).toBe('23514')
      expect(error?.message).toBe('Escribe tu mensaje o vuelve a usar el mensaje predeterminado.')
    }
    expect(await leer(ctx.ids.seller1)).toEqual(PREDETERMINADO)
  })

  it('WM-08: más de 1.000 caracteres', async () => {
    const { error } = await guardar(seller1, true, 'x'.repeat(1001))
    expect(error?.code).toBe('23514')
    expect(error?.message).toBe('El mensaje no puede superar 1.000 caracteres.')
    expect(await leer(ctx.ids.seller1)).toEqual(PREDETERMINADO)
  })

  it('WM-09: el CHECK de coherencia cierra la puerta aunque se escriba por fuera de la RPC', async () => {
    for (const texto of [null, '   ']) {
      const { error } = await ctx.svc
        .from('memberships')
        .update({ weekly_results_use_custom_message: true, weekly_results_custom_message: texto })
        .eq('profile_id', ctx.ids.seller1)
      expect(error?.message, String(texto)).toContain('memberships_weekly_results_message_coherent')
    }
  })

  it('WM-10: el CHECK de longitud tampoco se salta con la service role', async () => {
    const { error } = await ctx.svc
      .from('memberships')
      .update({ weekly_results_custom_message: 'x'.repeat(1001) })
      .eq('profile_id', ctx.ids.seller1)
    expect(error?.message).toContain('memberships_weekly_results_message_length')

    const exacto = await ctx.svc
      .from('memberships')
      .update({ weekly_results_custom_message: 'x'.repeat(1000) })
      .eq('profile_id', ctx.ids.seller1)
    expect(exacto.error).toBeNull()
    await restablecer([ctx.ids.seller1])
  })

  it('WM-11: un texto conservado con el interruptor apagado SÍ es un estado válido', async () => {
    const { error } = await ctx.svc
      .from('memberships')
      .update({
        weekly_results_use_custom_message: false,
        weekly_results_custom_message: 'Guardado',
      })
      .eq('profile_id', ctx.ids.seller1)
    expect(error).toBeNull()
    await restablecer([ctx.ids.seller1])
  })
})

// =============================================================================
describe('WM — nadie configura a otro (BR-H10)', () => {
  it('WM-12: la firma no tiene vendedor, perfil, organización ni membresía', async () => {
    const { rows } = await db.query(`
      select pg_get_function_identity_arguments(p.oid) as args,
             p.prosecdef as security_definer,
             p.proconfig as config
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = '${RPC}'
    `)
    expect(rows).toHaveLength(1)
    expect(rows[0].args).toBe('p_use_custom_message boolean, p_custom_message text')
    expect(rows[0].security_definer).toBe(true)
    expect(rows[0].config).toEqual(['search_path=public, pg_temp'])
  })

  it('WM-13: un identificador colado en la petición no alcanza a nadie', async () => {
    const { error } = await seller1.rpc(RPC, {
      p_use_custom_message: true,
      p_custom_message: 'Intruso',
      p_profile_id: ctx.ids.seller2,
    } as never)
    // PostgREST no encuentra una función con ese parámetro: no hay otra firma.
    expect(error).not.toBeNull()
    expect(await leer(ctx.ids.seller2)).toEqual(PREDETERMINADO)
    expect(await leer(ctx.ids.seller1)).toEqual(PREDETERMINADO)
  })

  it('WM-14: dos vendedores llamando a la misma función acaban cada uno con lo suyo', async () => {
    await guardar(seller1, true, 'Del vendedor uno')
    await guardar(seller2, true, 'Del vendedor dos')

    expect(await leer(ctx.ids.seller1)).toEqual({ usarPropio: true, texto: 'Del vendedor uno' })
    expect(await leer(ctx.ids.seller2)).toEqual({ usarPropio: true, texto: 'Del vendedor dos' })
    expect(await leer(ctx.ids.owner)).toEqual(PREDETERMINADO)
    await restablecer([ctx.ids.seller1, ctx.ids.seller2])
  })

  it('WM-15: el Dueño y el Administrador no pueden usarla', async () => {
    for (const [nombre, client, id] of [
      ['dueño', owner, ctx.ids.owner],
      ['administrador', admin, ctx.ids.admin],
    ] as const) {
      const { error } = await guardar(client, true, 'Del personal')
      expect(error?.code, nombre).toBe('42501')
      expect(error?.message, nombre).toContain('vendedor')
      expect(await leer(id), nombre).toEqual(PREDETERMINADO)
    }
  })

  it('WM-16: un vendedor padre solo escribe el suyo, nunca el de su integrante', async () => {
    const { error } = await guardar(parent, true, 'Del padre')
    expect(error).toBeNull()
    expect(await leer(parentId)).toEqual({ usarPropio: true, texto: 'Del padre' })
    expect(await leer(memberId)).toEqual(PREDETERMINADO)

    // Ni con un UPDATE directo: la RLS no le deja escribir la fila de su equipo.
    const { data } = await parent
      .from('memberships')
      .update({ weekly_results_use_custom_message: true, weekly_results_custom_message: 'Encima' })
      .eq('profile_id', memberId)
      .select('profile_id')
    expect(data ?? []).toHaveLength(0)
    expect(await leer(memberId)).toEqual(PREDETERMINADO)

    // Y al revés: el integrante guarda el suyo sin tocar el del padre.
    await guardar(member, true, 'Del integrante')
    expect(await leer(parentId)).toEqual({ usarPropio: true, texto: 'Del padre' })
    expect(await leer(memberId)).toEqual({ usarPropio: true, texto: 'Del integrante' })
  })

  it('WM-17: una cuenta DESACTIVADA no configura nada (BR-A04)', async () => {
    await ctx.svc.from('memberships').update({ is_active: false }).eq('profile_id', memberId)
    try {
      const { error } = await guardar(member, false, 'Desde una cuenta inactiva')
      expect(error?.code).toBe('42501')
      expect(error?.message).toContain('vendedor')
    } finally {
      await ctx.svc.from('memberships').update({ is_active: true }).eq('profile_id', memberId)
    }
    expect((await leer(memberId)).texto).toBe('Del integrante')
  })

  it('WM-18: sin sesión no se puede ejecutar, y ni PUBLIC ni `anon` tienen el permiso', async () => {
    const { error } = await guardar(anonClient(), true, 'Anónimo')
    expect(error).not.toBeNull()

    const { rows } = await db.query(`
      select has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role,
             exists (
               select 1 from aclexplode(p.proacl) acl
               where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
             ) as public
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = '${RPC}'
    `)
    expect(rows).toEqual([{ anon: false, authenticated: true, service_role: true, public: false }])
  })

  it('WM-19: un vendedor NO puede escribir su propia fila con un UPDATE directo', async () => {
    // Por eso existe la RPC. Si esto devolviera una fila, alguien habría ampliado
    // `memberships_update_staff`, y con ella el rol, el estado y la ganancia.
    const { data, error } = await seller1
      .from('memberships')
      .update({ weekly_results_use_custom_message: true, weekly_results_custom_message: 'A mano' })
      .eq('profile_id', ctx.ids.seller1)
      .select('profile_id')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
    expect(await leer(ctx.ids.seller1)).toEqual(PREDETERMINADO)
  })

  it('WM-20: ni la de otro vendedor, que además no puede leer', async () => {
    await guardar(seller1, true, PROPIO)

    const escritura = await seller2
      .from('memberships')
      .update({ weekly_results_custom_message: 'Pisado' })
      .eq('profile_id', ctx.ids.seller1)
      .select('profile_id')
    expect(escritura.data ?? []).toHaveLength(0)

    const lectura = await seller2
      .from('memberships')
      .select('weekly_results_custom_message')
      .eq('profile_id', ctx.ids.seller1)
    expect(lectura.data ?? []).toHaveLength(0)

    expect(await leer(ctx.ids.seller1)).toEqual({ usarPropio: true, texto: PROPIO })
    await restablecer([ctx.ids.seller1])
  })
})

// =============================================================================
describe('WM — la auditoría', () => {
  it('WM-21: el disparador existente anota el cambio UNA vez, con quién y qué', async () => {
    await restablecer([ctx.ids.seller1])
    const marca = `Auditoría ${Date.now().toString(36)}`

    await guardar(seller1, true, marca)
    // Guardar lo mismo otra vez no cambia nada, y no anota nada.
    await guardar(seller1, true, marca)

    const { rows } = await db.query(
      `select a.action, a.actor_profile_id, a.old_values, a.new_values
       from audit_logs a
       join memberships m on m.id = a.entity_id
       where a.entity_type = 'membership'
         and m.profile_id = $1
         and a.new_values ->> 'weekly_results_custom_message' = $2`,
      [ctx.ids.seller1, marca],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe('membership.update')
    expect(rows[0].actor_profile_id).toBe(ctx.ids.seller1)
    expect(rows[0].new_values).toEqual({
      weekly_results_use_custom_message: true,
      weekly_results_custom_message: marca,
    })
    expect(rows[0].old_values).toEqual({
      weekly_results_use_custom_message: false,
      weekly_results_custom_message: null,
    })
    await restablecer([ctx.ids.seller1])
  })
})

// =============================================================================
describe('WM — la lectura de la pantalla, con sesiones reales', () => {
  it('WM-22: el vendedor lee lo suyo', async () => {
    await guardar(seller1, true, PROPIO)
    sesion.client = seller1
    expect(await getWeeklyResultsMessageSettings()).toEqual({
      kind: 'ready',
      settings: { useCustomMessage: true, customMessage: PROPIO },
    })
  })

  it('WM-23: otro vendedor lee lo suyo, no lo del primero', async () => {
    sesion.client = seller2
    expect(await getWeeklyResultsMessageSettings()).toEqual({
      kind: 'ready',
      settings: EMPTY_WEEKLY_RESULTS_MESSAGE_SETTINGS,
    })
  })

  it('WM-24: el personal y quien no tiene sesión reciben el predeterminado', async () => {
    for (const client of [owner, anonClient()]) {
      sesion.client = client
      expect(await getWeeklyResultsMessageSettings()).toEqual({
        kind: 'ready',
        settings: EMPTY_WEEKLY_RESULTS_MESSAGE_SETTINGS,
      })
    }
    await restablecer([ctx.ids.seller1])
  })
})
