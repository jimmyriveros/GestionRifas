import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadSeedContext, serviceClient, signInAs, USERS, type Client } from './helpers'

/**
 * La configuracion de WhatsApp del vendedor, en la base (BR-W01..BR-W03,
 * BR-W07; migracion 0050, D-176).
 *
 * Lo que se prueba aqui es lo que la interfaz NO puede garantizar: quien puede
 * escribir, sobre quien, y que combinaciones no pueden existir. Cada prueba
 * inicia sesion como un usuario real y opera con la clave publica, como haria
 * alguien con acceso al navegador (docs/TESTING.md 2). Ninguna usa la service
 * role para probar permisos.
 */

const GROUP_A = 'https://chat.whatsapp.com/AAAaaa111222'
const GROUP_B = 'https://chat.whatsapp.com/BBBbbb333444'

let seller1: Client
let seller2: Client
let owner: Client
let ctx: Awaited<ReturnType<typeof loadSeedContext>>

beforeAll(async () => {
  ctx = await loadSeedContext()
  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
  owner = await signInAs(USERS.owner)
})

/** Deja las tres columnas como estaban, para no contaminar otras pruebas. */
afterAll(async () => {
  const svc = serviceClient()
  await svc
    .from('memberships')
    .update({
      whatsapp_group_url: null,
      whatsapp_use_custom_message: false,
      whatsapp_custom_message: null,
    })
    .eq('role', 'seller')
})

describe('un vendedor guarda SU configuracion', () => {
  it('la escribe y la vuelve a leer', async () => {
    const { data, error } = await seller1.rpc('set_seller_whatsapp_settings', {
      p_group_url: GROUP_A,
      p_use_custom_message: false,
      p_custom_message: null,
    })

    expect(error).toBeNull()
    expect(data?.[0]?.whatsapp_group_url).toBe(GROUP_A)
    expect(data?.[0]?.whatsapp_use_custom_message).toBe(false)
  })

  it('recorta los espacios que arrastra el portapapeles', async () => {
    const { data, error } = await seller1.rpc('set_seller_whatsapp_settings', {
      p_group_url: `  ${GROUP_A}  `,
      p_use_custom_message: false,
      p_custom_message: null,
    })

    expect(error).toBeNull()
    expect(data?.[0]?.whatsapp_group_url).toBe(GROUP_A)
  })

  it('guarda su mensaje y lo conserva al apagar el interruptor (BR-W03)', async () => {
    await seller1.rpc('set_seller_whatsapp_settings', {
      p_group_url: GROUP_A,
      p_use_custom_message: true,
      p_custom_message: 'Hola, bienvenida al grupo.',
    })

    // Apagar el interruptor SIN borrar el texto: es lo que hace que volver a
    // encenderlo lo devuelva tal cual.
    const { data, error } = await seller1.rpc('set_seller_whatsapp_settings', {
      p_group_url: GROUP_A,
      p_use_custom_message: false,
      p_custom_message: 'Hola, bienvenida al grupo.',
    })

    expect(error).toBeNull()
    expect(data?.[0]?.whatsapp_use_custom_message).toBe(false)
    expect(data?.[0]?.whatsapp_custom_message).toBe('Hola, bienvenida al grupo.')
  })

  it('deja quitar el enlace dejandolo en blanco', async () => {
    const { data, error } = await seller1.rpc('set_seller_whatsapp_settings', {
      p_group_url: null,
      p_use_custom_message: false,
      p_custom_message: null,
    })

    expect(error).toBeNull()
    expect(data?.[0]?.whatsapp_group_url).toBeNull()
  })
})

describe('lo que la base NO deja escribir', () => {
  it('rechaza un enlace que no es de un grupo de WhatsApp', async () => {
    const { error } = await seller1.rpc('set_seller_whatsapp_settings', {
      p_group_url: 'https://chat.whatsapp.com.evil.test/ABCdef123456',
      p_use_custom_message: false,
      p_custom_message: null,
    })

    expect(error).not.toBeNull()
    expect(error!.message).toContain('chat.whatsapp.com')
  })

  it('rechaza http, aunque el dominio sea el bueno', async () => {
    const { error } = await seller1.rpc('set_seller_whatsapp_settings', {
      p_group_url: 'http://chat.whatsapp.com/ABCdef123456',
      p_use_custom_message: false,
      p_custom_message: null,
    })

    expect(error).not.toBeNull()
  })

  it('rechaza «usar mi mensaje» sin mensaje, con una frase que se puede leer', async () => {
    const { error } = await seller1.rpc('set_seller_whatsapp_settings', {
      p_group_url: GROUP_A,
      p_use_custom_message: true,
      p_custom_message: '   ',
    })

    expect(error).not.toBeNull()
    expect(error!.message).toContain('mensaje')
  })

  it('el CHECK cierra la puerta aunque se escriba por fuera de la RPC', async () => {
    // La service role omite la RLS, pero NO los CHECK. Es lo que garantiza que
    // el estado incoherente no exista, venga por donde venga.
    const svc = serviceClient()
    const { error } = await svc
      .from('memberships')
      .update({ whatsapp_use_custom_message: true, whatsapp_custom_message: null })
      .eq('profile_id', ctx.ids.seller1)

    expect(error).not.toBeNull()
    expect(error!.message).toContain('memberships_whatsapp_message_coherent')
  })

  it('el CHECK del enlace tampoco se puede saltar con la service role', async () => {
    const svc = serviceClient()
    const { error } = await svc
      .from('memberships')
      .update({ whatsapp_group_url: 'ftp://chat.whatsapp.com/ABCdef123456' })
      .eq('profile_id', ctx.ids.seller1)

    expect(error).not.toBeNull()
    expect(error!.message).toContain('memberships_whatsapp_group_url_format')
  })
})

describe('nadie configura a otro (BR-W07)', () => {
  it('la RPC no acepta un vendedor: solo puede escribir el suyo', async () => {
    // La prueba de la decision de diseño: no hay `p_profile_id` que manipular.
    // Vendedor 2 llama y lo unico que puede cambiar es SU fila.
    await seller1.rpc('set_seller_whatsapp_settings', {
      p_group_url: GROUP_A,
      p_use_custom_message: false,
      p_custom_message: null,
    })
    await seller2.rpc('set_seller_whatsapp_settings', {
      p_group_url: GROUP_B,
      p_use_custom_message: false,
      p_custom_message: null,
    })

    const svc = serviceClient()
    const { data } = await svc
      .from('memberships')
      .select('profile_id, whatsapp_group_url')
      .in('profile_id', [ctx.ids.seller1, ctx.ids.seller2])

    const uno = data!.find((row) => row.profile_id === ctx.ids.seller1)
    const dos = data!.find((row) => row.profile_id === ctx.ids.seller2)

    expect(uno?.whatsapp_group_url).toBe(GROUP_A)
    expect(dos?.whatsapp_group_url).toBe(GROUP_B)
  })

  it('un vendedor NO puede escribir la membresia de otro con un UPDATE directo', async () => {
    // `memberships_update_staff` es la unica politica de escritura y no le
    // alcanza. La RLS no lanza al rechazar: deja cero filas.
    const { data, error } = await seller2
      .from('memberships')
      .update({ whatsapp_group_url: GROUP_B })
      .eq('profile_id', ctx.ids.seller1)
      .select('profile_id')

    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('un vendedor tampoco puede escribir la SUYA con un UPDATE directo', async () => {
    // Por eso existe la RPC. Si esto empezara a devolver una fila, alguien
    // habria ampliado la politica y con ella el rol, el estado y la ganancia.
    const { data, error } = await seller1
      .from('memberships')
      .update({ whatsapp_group_url: GROUP_B })
      .eq('profile_id', ctx.ids.seller1)
      .select('profile_id')

    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('un vendedor no ve la configuracion de otro vendedor ajeno a su equipo', async () => {
    const { data } = await seller2
      .from('memberships')
      .select('profile_id, whatsapp_group_url')
      .eq('profile_id', ctx.ids.seller1)

    expect(data ?? []).toHaveLength(0)
  })

  it('el personal no puede usar la RPC: no tiene grupo que configurar', async () => {
    const { error } = await owner.rpc('set_seller_whatsapp_settings', {
      p_group_url: GROUP_A,
      p_use_custom_message: false,
      p_custom_message: null,
    })

    expect(error).not.toBeNull()
    expect(error!.message).toContain('vendedor')
  })
})

describe('el cambio queda auditado', () => {
  it('lo anota el disparador que ya existia, sin codigo nuevo', async () => {
    await seller1.rpc('set_seller_whatsapp_settings', {
      p_group_url: GROUP_B,
      p_use_custom_message: false,
      p_custom_message: null,
    })

    const svc = serviceClient()
    const { data } = await svc
      .from('audit_logs')
      .select('action, entity_type, entity_id, new_values')
      .eq('entity_type', 'membership')
      .order('created_at', { ascending: false })
      .limit(20)

    const anotado = data!.some(
      (row) =>
        row.new_values !== null && JSON.stringify(row.new_values).includes('whatsapp_group_url'),
    )
    expect(anotado).toBe(true)
  })
})
