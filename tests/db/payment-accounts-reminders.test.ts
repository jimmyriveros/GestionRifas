/**
 * Cuentas para recibir pagos y recordatorios de pago — ETAPA 1
 * (BR-M01..BR-M09, BR-S01..BR-S06; migracion 0051, D-185).
 *
 * Lo que se prueba aqui es lo que ninguna pantalla puede garantizar: QUIEN ve,
 * QUIEN escribe, sobre QUIEN, y que combinaciones de datos no pueden existir
 * venga la escritura por donde venga.
 *
 * El aislamiento de esta funcion es el MAS ESTRECHO del producto: no es «por
 * organizacion» ni «por vendedor y su cadena de mando», es POR VENDEDOR. Ni el
 * Dueno, ni el Administrador, ni el vendedor padre del equipo. Por eso la mitad
 * de este archivo son pruebas de que alguien NO ve nada.
 *
 * Ninguna prueba usa la service role para el acto probado (D-043): cada una
 * inicia sesion como un usuario real y opera con la clave publica, como haria
 * alguien con acceso al navegador. La service role solo prepara, comprueba los
 * CHECK —que si se aplican con ella— y limpia.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  DB_URL,
  anonClient,
  loadSeedContext,
  SEED_PASSWORD,
  signInAs,
  USERS,
  type Client,
} from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let db: PgClient

let seller1: Client
let seller2: Client
let owner: Client
let admin: Client
let controlSeller: Client

/**
 * Un padre y un integrante PROPIOS de esta suite.
 *
 * No se le monta equipo a `vendedor1` ni a `vendedor2`: son cuentas compartidas
 * y otras suites comprueban a quien ve un vendedor, asi que el resultado
 * dependeria del orden de ejecucion (I-035).
 */
let parentId: string
let parentEmail: string
let parent: Client

let memberId: string
let memberEmail: string
let member: Client

const createdProfileIds: string[] = []

const NEQUI = { kind: 'nequi' as const, holder: 'Ana Torres', phone: '300 123 4567' }
const BANK = {
  kind: 'bank' as const,
  holder: 'Ana Torres',
  bank: 'Bancolombia',
  type: 'savings' as const,
  number: '123-456-789',
}

async function createAuthUser(email: string, fullName: string): Promise<string> {
  const { data, error } = await ctx.svc.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: '3001234567' },
  })
  if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`)
  // `createUser` no deja la contrasena usable hasta actualizarla (I-007).
  await ctx.svc.auth.admin.updateUserById(data.user.id, { password: SEED_PASSWORD })
  createdProfileIds.push(data.user.id)
  return data.user.id
}

/** Deja a un vendedor sin cuentas ni recordatorios, para que una prueba parta de cero. */
async function limpiarDe(sellerId: string) {
  await ctx.svc.from('seller_payment_reminders').delete().eq('seller_id', sellerId)
  await ctx.svc.from('seller_payment_accounts').delete().eq('seller_id', sellerId)
}

/**
 * Atajo: crea una cuenta de Nequi del vendedor que llama.
 *
 * `p_label` se omite cuando no hay etiqueta en vez de mandarse `null`: los tipos
 * que genera la CLI declaran los argumentos opcionales como `string | undefined`.
 */
function nequi(client: Client, phone: string, label?: string) {
  return client.rpc('create_seller_payment_account', {
    p_kind: 'nequi',
    p_holder_name: NEQUI.holder,
    p_phone: phone,
    ...(label === undefined ? {} : { p_label: label }),
  })
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
  owner = await signInAs(USERS.owner)
  admin = await signInAs(USERS.admin)
  controlSeller = await signInAs(USERS.otherOrgSeller)

  const stamp = Date.now().toString(36)

  parentEmail = `cobro-padre-${stamp}@demo.test`
  parentId = await createAuthUser(parentEmail, 'Padre Cobro')
  const { error: parentError } = await ctx.svc
    .from('memberships')
    .insert({ organization_id: ctx.demoOrg.id, profile_id: parentId, role: 'seller' })
  if (parentError) throw parentError
  parent = await signInAs(parentEmail)

  memberEmail = `cobro-equipo-${stamp}@demo.test`
  memberId = await createAuthUser(memberEmail, 'Integrante Cobro')
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
  // Orden obligatorio: las cuentas y los recordatorios referencian la membresia
  // con `on delete restrict`.
  for (const id of [ctx.ids.seller1, ctx.ids.seller2, parentId, memberId]) {
    await limpiarDe(id)
  }
  if (createdProfileIds.length > 0) {
    await ctx.svc.from('memberships').delete().in('profile_id', createdProfileIds)
    for (const id of createdProfileIds) {
      await ctx.svc.auth.admin.deleteUser(id)
    }
  }
  await db.end()
})

// =============================================================================
describe('M — aislamiento de las cuentas (BR-M01, BR-M02)', () => {
  let cuentaDeSeller1: string

  beforeAll(async () => {
    await limpiarDe(ctx.ids.seller1)
    const { data, error } = await nequi(seller1, '3001112233', 'Mi Nequi')
    if (error) throw new Error(error.message)
    cuentaDeSeller1 = data!.id
  })

  it('M-01: el vendedor crea su cuenta y la vuelve a leer', async () => {
    const { data, error } = await seller1
      .from('seller_payment_accounts')
      .select('id, kind, holder_name, phone, sort_order, archived_at')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]!.id).toBe(cuentaDeSeller1)
    expect(data![0]!.kind).toBe('nequi')
    expect(data![0]!.sort_order).toBe(1)
    expect(data![0]!.archived_at).toBeNull()
  })

  it('M-02: otro vendedor de la misma organizacion NO la ve', async () => {
    const { data, error } = await seller2.from('seller_payment_accounts').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('M-03: el Dueno NO ve las cuentas de un vendedor', async () => {
    const { data, error } = await owner.from('seller_payment_accounts').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('M-04: el Administrador tampoco', async () => {
    const { data, error } = await admin.from('seller_payment_accounts').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('M-05: el VENDEDOR PADRE no ve las cuentas de su integrante', async () => {
    // El caso que una politica copiada de `memberships_select` habria dejado
    // pasar, y la razon entera de que esto no sea una columna mas (D-185).
    const { error: crear } = await nequi(member, '3004445566')
    expect(crear).toBeNull()

    const { data, error } = await parent.from('seller_payment_accounts').select('id, seller_id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('M-06: un vendedor de otra organizacion tampoco', async () => {
    const { data, error } = await controlSeller.from('seller_payment_accounts').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('M-07: un visitante sin sesion no lee nada', async () => {
    const { data, error } = await anonClient().from('seller_payment_accounts').select('id')
    // `anon` no tiene ningun privilegio sobre la tabla (0009/0010): la lectura
    // falla antes de llegar a la politica.
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('M-08: un vendedor no puede INSERTAR directo: no hay privilegio ni politica', async () => {
    const { error } = await seller1.from('seller_payment_accounts').insert({
      organization_id: ctx.demoOrg.id,
      seller_id: ctx.ids.seller1,
      kind: 'nequi',
      holder_name: 'Yo mismo',
      phone: '3009998877',
      sort_order: 2,
    })
    expect(error).not.toBeNull()
  })

  it('M-09: un vendedor no puede ACTUALIZAR su propia fila directo (por eso existe la RPC)', async () => {
    const { data, error } = await seller1
      .from('seller_payment_accounts')
      .update({ holder_name: 'Cambiado a mano' })
      .eq('id', cuentaDeSeller1)
      .select('id')

    // 42501: no hay privilegio de UPDATE, asi que ni siquiera se llega a la
    // politica. Si algun dia se concediera, esta prueba avisaria de que la RPC
    // dejo de ser la unica puerta y con ella se fueron el tope, el orden y la
    // bitacora.
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()

    const { data: intacta } = await seller1
      .from('seller_payment_accounts')
      .select('holder_name')
      .eq('id', cuentaDeSeller1)
      .single()
    expect(intacta!.holder_name).toBe(NEQUI.holder)
  })

  it('M-09b: tampoco puede BORRARLA: no hay privilegio ni politica (D-038)', async () => {
    const { error } = await seller1
      .from('seller_payment_accounts')
      .delete()
      .eq('id', cuentaDeSeller1)
    expect(error?.code).toBe('42501')

    const { data } = await seller1
      .from('seller_payment_accounts')
      .select('id')
      .eq('id', cuentaDeSeller1)
    expect(data).toHaveLength(1)
  })

  it('M-10: nadie configura a otro, porque la RPC no recibe vendedor', async () => {
    // Las dos sesiones llaman a la MISMA funcion sin poder nombrar a nadie: el
    // perfil sale de auth.uid(). Cada una acaba con lo suyo.
    const { data: filasUno } = await seller1
      .from('seller_payment_accounts')
      .select('seller_id')
    const { data: filasDos } = await member.from('seller_payment_accounts').select('seller_id')

    expect(filasUno!.every((f) => f.seller_id === ctx.ids.seller1)).toBe(true)
    expect(filasDos!.every((f) => f.seller_id === memberId)).toBe(true)
    expect(filasUno!.length).toBeGreaterThan(0)
    expect(filasDos!.length).toBeGreaterThan(0)
  })

  it('M-11: el personal no puede usar la RPC', async () => {
    const { error } = await nequi(owner, '3007778899')
    expect(error?.message).toMatch(/Solo un vendedor/i)
  })

  it('M-12: una cuenta DESACTIVADA no puede configurar nada (BR-A04)', async () => {
    await ctx.svc.from('memberships').update({ is_active: false }).eq('profile_id', memberId)
    try {
      const { error } = await nequi(member, '3006665544')
      expect(error?.message).toMatch(/Solo un vendedor/i)
    } finally {
      await ctx.svc.from('memberships').update({ is_active: true }).eq('profile_id', memberId)
    }
  })
})

// =============================================================================
describe('M — forma de una cuenta segun su tipo (BR-M04)', () => {
  /**
   * Los CHECK se prueban con la SERVICE ROLE a proposito: omite la RLS pero NO
   * los CHECK, asi que es la unica forma de demostrar que el estado incoherente
   * no puede existir venga por donde venga, y no solo cuando se pasa por la RPC.
   */
  const base = {
    organization_id: '',
    seller_id: '',
    holder_name: 'Ana Torres',
    sort_order: null as number | null,
    archived_at: new Date().toISOString(),
  }

  beforeAll(() => {
    base.organization_id = ctx.demoOrg.id
    base.seller_id = ctx.ids.seller2
  })

  it('M-13: un Nequi con numero de cuenta bancaria se rechaza', async () => {
    const { error } = await ctx.svc
      .from('seller_payment_accounts')
      .insert({ ...base, kind: 'nequi', phone: '3001112233', account_number: '123456' })
    expect(error?.message).toMatch(/shape_by_kind/)
  })

  it('M-14: una cuenta bancaria sin banco se rechaza', async () => {
    const { error } = await ctx.svc.from('seller_payment_accounts').insert({
      ...base,
      kind: 'bank',
      account_type: 'savings',
      account_number: '123456',
    })
    expect(error?.message).toMatch(/shape_by_kind/)
  })

  it('M-15: una cuenta bancaria con telefono se rechaza', async () => {
    const { error } = await ctx.svc.from('seller_payment_accounts').insert({
      ...base,
      kind: 'bank',
      bank_name: 'Bancolombia',
      account_type: 'checking',
      account_number: '123456',
      phone: '3001112233',
    })
    expect(error?.message).toMatch(/shape_by_kind/)
  })

  it('M-16: un Nequi sin telefono se rechaza', async () => {
    const { error } = await ctx.svc
      .from('seller_payment_accounts')
      .insert({ ...base, kind: 'nequi' })
    expect(error?.message).toMatch(/shape_by_kind/)
  })

  it('M-17: un telefono con formato imposible se rechaza', async () => {
    const { error } = await ctx.svc
      .from('seller_payment_accounts')
      .insert({ ...base, kind: 'daviplata', phone: 'no-es-un-telefono' })
    expect(error?.message).toMatch(/phone_format/)
  })

  it('M-18: una cuenta activa SIEMPRE tiene posicion, y una archivada nunca', async () => {
    const sinPosicion = await ctx.svc.from('seller_payment_accounts').insert({
      ...base,
      kind: 'nequi',
      phone: '3001112233',
      archived_at: null,
      sort_order: null,
    })
    expect(sinPosicion.error?.message).toMatch(/slot_presence/)

    const archivadaConPosicion = await ctx.svc.from('seller_payment_accounts').insert({
      ...base,
      kind: 'nequi',
      phone: '3001112233',
      archived_at: new Date().toISOString(),
      sort_order: 3,
    })
    expect(archivadaConPosicion.error?.message).toMatch(/slot_presence/)
  })

  it('M-19: sin titular, la RPC lo dice con una frase que se puede leer', async () => {
    const { error } = await seller1.rpc('create_seller_payment_account', {
      p_kind: 'nequi',
      p_holder_name: '   ',
      p_phone: '3001112233',
    })
    expect(error?.message).toMatch(/titular/i)
  })
})

// =============================================================================
describe('M — tope de cinco, orden y duplicados (BR-M05, BR-M06, BR-M08)', () => {
  beforeAll(async () => {
    await limpiarDe(memberId)
  })

  it('M-20: la sexta cuenta se rechaza con un mensaje que dice que hacer', async () => {
    for (let i = 1; i <= 5; i++) {
      const { error } = await nequi(member, `30011122${String(i).padStart(2, '0')}`)
      expect(error, `cuenta ${i}`).toBeNull()
    }

    const { error } = await nequi(member, '3009999999')
    expect(error?.message).toMatch(/5 cuentas activas/i)
    expect(error?.message).toMatch(/Archiva una/i)
  })

  it('M-21: el tope NO es solo la RPC: no hay una sexta posicion', async () => {
    // La invariante estructural. Con la service role, que omite la RLS y podria
    // insertar lo que quisiera, la sexta cuenta activa sigue siendo imposible:
    // `sort_order` es 1..5 y unico por vendedor.
    const { error } = await ctx.svc.from('seller_payment_accounts').insert({
      organization_id: ctx.demoOrg.id,
      seller_id: memberId,
      kind: 'nequi',
      holder_name: 'Por la puerta de atras',
      phone: '3008887766',
      sort_order: 6,
    })
    expect(error?.message).toMatch(/slot_range/)

    const repetida = await ctx.svc.from('seller_payment_accounts').insert({
      organization_id: ctx.demoOrg.id,
      seller_id: memberId,
      kind: 'nequi',
      holder_name: 'Por la puerta de atras',
      phone: '3008887766',
      sort_order: 3,
    })
    expect(repetida.error?.message).toMatch(/slot_unique/)
  })

  it('M-22: archivar libera cupo y la posicion', async () => {
    const { data: antes } = await member
      .from('seller_payment_accounts')
      .select('id, sort_order')
      .is('archived_at', null)
      .order('sort_order')

    const { data: archivada, error } = await member.rpc('archive_seller_payment_account', {
      p_id: antes![4]!.id,
    })
    expect(error).toBeNull()
    expect(archivada!.sort_order).toBeNull()
    expect(archivada!.archived_at).not.toBeNull()

    const { error: sexta } = await nequi(member, '3009999999')
    expect(sexta).toBeNull()
  })

  it('M-23: la misma cuenta dos veces sin archivar se rechaza, aunque se escriba distinto', async () => {
    await limpiarDe(memberId)
    const { error: primera } = await nequi(member, '300 123 4567')
    expect(primera).toBeNull()

    // Los mismos digitos con otro formato: desde D-184 el teclado produce la
    // forma con separadores y la base guarda lo que le manden.
    const { error } = await nequi(member, '3001234567')
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no_duplicates|duplicate key/i)
  })

  it('M-24: archivada, la misma cuenta se puede volver a crear', async () => {
    const { data: activas } = await member
      .from('seller_payment_accounts')
      .select('id')
      .is('archived_at', null)
    await member.rpc('archive_seller_payment_account', { p_id: activas![0]!.id })

    const { error } = await nequi(member, '3001234567')
    expect(error).toBeNull()
  })

  it('M-25: recuperar una archivada respeta el tope', async () => {
    await limpiarDe(memberId)
    const creadas: string[] = []
    for (let i = 1; i <= 5; i++) {
      const { data } = await nequi(member, `30022233${String(i).padStart(2, '0')}`)
      creadas.push(data!.id)
    }
    await member.rpc('archive_seller_payment_account', { p_id: creadas[0]! })

    // Hay sitio: vuelve.
    const { data: vuelta, error } = await member.rpc('restore_seller_payment_account', {
      p_id: creadas[0]!,
    })
    expect(error).toBeNull()
    expect(vuelta!.sort_order).toBe(1)

    // Y ahora no: cinco activas otra vez.
    await member.rpc('archive_seller_payment_account', { p_id: creadas[1]! })
    await nequi(member, '3005554433')
    const { error: sinSitio } = await member.rpc('restore_seller_payment_account', {
      p_id: creadas[1]!,
    })
    expect(sinSitio?.message).toMatch(/5 cuentas activas/i)
  })

  it('M-26: reordenar cambia el orden del mensaje', async () => {
    await limpiarDe(memberId)
    const ids: string[] = []
    for (let i = 1; i <= 3; i++) {
      const { data } = await nequi(member, `30033344${String(i).padStart(2, '0')}`)
      ids.push(data!.id)
    }

    const invertido = [...ids].reverse()
    const { data, error } = await member.rpc('reorder_seller_payment_accounts', {
      p_ids: invertido,
    })
    expect(error).toBeNull()
    expect(data!.map((c) => c.id)).toEqual(invertido)
    expect(data!.map((c) => c.sort_order)).toEqual([1, 2, 3])
  })

  it('M-27: un orden incompleto, con repetidos o con una cuenta ajena se rechaza', async () => {
    const { data: mias } = await member
      .from('seller_payment_accounts')
      .select('id')
      .is('archived_at', null)
      .order('sort_order')
    const ids = mias!.map((c) => c.id)

    const incompleto = await member.rpc('reorder_seller_payment_accounts', {
      p_ids: ids.slice(0, 2),
    })
    expect(incompleto.error?.message).toMatch(/no corresponde a tus cuentas/i)

    const repetido = await member.rpc('reorder_seller_payment_accounts', {
      p_ids: [ids[0]!, ids[0]!, ids[1]!],
    })
    expect(repetido.error?.message).toMatch(/no corresponde a tus cuentas/i)

    // Una cuenta de OTRO vendedor: ni se toca ni se cuenta.
    const { data: ajena } = await seller1
      .from('seller_payment_accounts')
      .select('id')
      .limit(1)
    const conAjena = await member.rpc('reorder_seller_payment_accounts', {
      p_ids: [ids[0]!, ids[1]!, ajena![0]!.id],
    })
    expect(conAjena.error?.message).toMatch(/no corresponde a tus cuentas/i)
  })

  it('M-28: una cuenta ajena no se puede archivar ni corregir', async () => {
    const { data: ajena } = await seller1.from('seller_payment_accounts').select('id').limit(1)

    const archivar = await member.rpc('archive_seller_payment_account', { p_id: ajena![0]!.id })
    expect(archivar.error?.message).toMatch(/no existe/i)

    const corregir = await member.rpc('update_seller_payment_account', {
      p_id: ajena![0]!.id,
      p_holder_name: 'Robada',
      p_phone: '3001112233',
    })
    expect(corregir.error?.message).toMatch(/no existe/i)

    // Y sigue como estaba.
    const { data: intacta } = await seller1
      .from('seller_payment_accounts')
      .select('holder_name')
      .eq('id', ajena![0]!.id)
      .single()
    expect(intacta!.holder_name).toBe(NEQUI.holder)
  })

  it('M-29: una cuenta bancaria guarda banco, tipo, numero y titular', async () => {
    await limpiarDe(memberId)
    const { data, error } = await member.rpc('create_seller_payment_account', {
      p_kind: 'bank',
      p_holder_name: BANK.holder,
      p_bank_name: BANK.bank,
      p_account_type: BANK.type,
      p_account_number: BANK.number,
      p_label: 'La de siempre',
    })

    expect(error).toBeNull()
    expect(data!.bank_name).toBe(BANK.bank)
    expect(data!.account_type).toBe('savings')
    expect(data!.account_number).toBe(BANK.number)
    expect(data!.phone).toBeNull()
  })
})

// =============================================================================
describe('S — recordatorios: modelo y aislamiento (BR-S01..BR-S04)', () => {
  let recordatorio: string

  beforeAll(async () => {
    await limpiarDe(ctx.ids.seller1)
    const { data, error } = await seller1.rpc('create_payment_reminder', {
      p_weekday: 2,
      p_time_of_day: '19:00:00',
    })
    if (error) throw new Error(error.message)
    recordatorio = data!.id
  })

  it('S-01: el vendedor crea su recordatorio y lo lee', async () => {
    const { data, error } = await seller1
      .from('seller_payment_reminders')
      .select('id, weekday, time_of_day, status, use_custom_message, next_run_at')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]!.weekday).toBe(2)
    expect(data![0]!.time_of_day).toBe('19:00:00')
    expect(data![0]!.status).toBe('active')
    expect(data![0]!.use_custom_message).toBe(false)
  })

  it('S-02: nadie mas lo ve: ni otro vendedor, ni el personal, ni el padre', async () => {
    for (const [quien, cliente] of [
      ['otro vendedor', seller2],
      ['el Dueno', owner],
      ['el Administrador', admin],
      ['el vendedor padre', parent],
      ['otra organizacion', controlSeller],
    ] as const) {
      const { data, error } = await cliente.from('seller_payment_reminders').select('id')
      expect(error, quien).toBeNull()
      expect(data, quien).toEqual([])
    }
  })

  it('S-03: no se puede escribir directo en la tabla', async () => {
    const { error } = await seller1.from('seller_payment_reminders').insert({
      organization_id: ctx.demoOrg.id,
      seller_id: ctx.ids.seller1,
      weekday: 3,
      time_of_day: '08:00:00',
    })
    expect(error).not.toBeNull()
  })

  it('S-04: el personal no puede usar la RPC', async () => {
    const { error } = await owner.rpc('create_payment_reminder', {
      p_weekday: 3,
      p_time_of_day: '08:00:00',
    })
    expect(error?.message).toMatch(/Solo un vendedor/i)
  })

  it('S-05: un recordatorio ajeno no se puede corregir ni pausar', async () => {
    const corregir = await member.rpc('update_payment_reminder', {
      p_id: recordatorio,
      p_weekday: 5,
      p_time_of_day: '06:00:00',
    })
    expect(corregir.error?.message).toMatch(/no existe/i)

    const pausar = await member.rpc('set_payment_reminder_status', {
      p_id: recordatorio,
      p_status: 'paused',
    })
    expect(pausar.error?.message).toMatch(/no existe/i)

    const { data: intacto } = await seller1
      .from('seller_payment_reminders')
      .select('weekday, status')
      .eq('id', recordatorio)
      .single()
    expect(intacto!.weekday).toBe(2)
    expect(intacto!.status).toBe('active')
  })

  it('S-06: dos recordatorios identicos se rechazan; a otra hora, no', async () => {
    const igual = await seller1.rpc('create_payment_reminder', {
      p_weekday: 2,
      p_time_of_day: '19:00:00',
    })
    expect(igual.error?.message).toMatch(/ese día a esa hora/i)

    const otraHora = await seller1.rpc('create_payment_reminder', {
      p_weekday: 2,
      p_time_of_day: '21:30:00',
    })
    expect(otraHora.error).toBeNull()
  })

  it('S-07: la precision es de MINUTO: los segundos se rechazan', async () => {
    const { error } = await ctx.svc.from('seller_payment_reminders').insert({
      organization_id: ctx.demoOrg.id,
      seller_id: ctx.ids.seller2,
      weekday: 4,
      time_of_day: '19:00:30',
    })
    expect(error?.message).toMatch(/minute_precision/)
  })

  it('S-08: el dia de la semana va de 1 a 7', async () => {
    for (const weekday of [0, 8]) {
      const { error } = await ctx.svc.from('seller_payment_reminders').insert({
        organization_id: ctx.demoOrg.id,
        seller_id: ctx.ids.seller2,
        weekday,
        time_of_day: '19:00:00',
      })
      expect(error?.message, `weekday=${weekday}`).toMatch(/weekday_range/)
    }
  })

  it('S-09: «uso mi mensaje» sin mensaje es imposible, por RPC y por CHECK', async () => {
    const porRpc = await seller1.rpc('create_payment_reminder', {
      p_weekday: 6,
      p_time_of_day: '10:00:00',
      p_use_custom_message: true,
      p_custom_message: '   ',
    })
    expect(porRpc.error?.message).toMatch(/Escribe tu mensaje/i)

    const porCheck = await ctx.svc.from('seller_payment_reminders').insert({
      organization_id: ctx.demoOrg.id,
      seller_id: ctx.ids.seller2,
      weekday: 6,
      time_of_day: '10:00:00',
      use_custom_message: true,
    })
    expect(porCheck.error?.message).toMatch(/message_coherent/)
  })

  it('S-10: apagar el interruptor NO borra lo escrito (BR-S06, como BR-W03)', async () => {
    const { data: creado } = await seller1.rpc('create_payment_reminder', {
      p_weekday: 7,
      p_time_of_day: '09:00:00',
      p_use_custom_message: true,
      p_custom_message: 'Buenas, recuerden su abono.',
    })

    const { data: apagado, error } = await seller1.rpc('update_payment_reminder', {
      p_id: creado!.id,
      p_weekday: 7,
      p_time_of_day: '09:00:00',
      p_use_custom_message: false,
      p_custom_message: 'Buenas, recuerden su abono.',
    })

    expect(error).toBeNull()
    expect(apagado!.use_custom_message).toBe(false)
    expect(apagado!.custom_message).toBe('Buenas, recuerden su abono.')
  })

  it('S-11: archivar libera esa hora para un recordatorio nuevo', async () => {
    const { data: creado } = await seller1.rpc('create_payment_reminder', {
      p_weekday: 4,
      p_time_of_day: '07:15:00',
    })

    const chocaba = await seller1.rpc('create_payment_reminder', {
      p_weekday: 4,
      p_time_of_day: '07:15:00',
    })
    expect(chocaba.error).not.toBeNull()

    await seller1.rpc('set_payment_reminder_status', { p_id: creado!.id, p_status: 'archived' })

    const { error } = await seller1.rpc('create_payment_reminder', {
      p_weekday: 4,
      p_time_of_day: '07:15:00',
    })
    expect(error).toBeNull()
  })

  it('S-12: reactivar uno cuya hora ya ocupa otro se explica antes de fallar', async () => {
    const { data: archivados } = await seller1
      .from('seller_payment_reminders')
      .select('id')
      .eq('status', 'archived')
      .limit(1)

    const { error } = await seller1.rpc('set_payment_reminder_status', {
      p_id: archivados![0]!.id,
      p_status: 'active',
    })
    expect(error?.message).toMatch(/otro recordatorio ese día a esa hora/i)
  })
})

// =============================================================================
describe('S — el tope de catorce (BR-S05)', () => {
  beforeAll(async () => {
    await limpiarDe(parentId)
  })

  it('S-13: el recordatorio numero 15 se rechaza', async () => {
    // 14 activos: dos por dia, a horas distintas.
    for (let i = 0; i < 14; i++) {
      const weekday = (i % 7) + 1
      const hora = i < 7 ? '08:00:00' : '20:00:00'
      const { error } = await parent.rpc('create_payment_reminder', {
        p_weekday: weekday,
        p_time_of_day: hora,
      })
      expect(error, `recordatorio ${i + 1}`).toBeNull()
    }

    const { error } = await parent.rpc('create_payment_reminder', {
      p_weekday: 1,
      p_time_of_day: '12:00:00',
    })
    expect(error?.message).toMatch(/14 recordatorios activos/i)
    expect(error?.message).toMatch(/Pausa o archiva/i)
  })

  it('S-14: un pausado no cuenta para el tope', async () => {
    const { data: activos } = await parent
      .from('seller_payment_reminders')
      .select('id')
      .eq('status', 'active')
      .limit(1)

    await parent.rpc('set_payment_reminder_status', {
      p_id: activos![0]!.id,
      p_status: 'paused',
    })

    const { error } = await parent.rpc('create_payment_reminder', {
      p_weekday: 1,
      p_time_of_day: '12:00:00',
    })
    expect(error).toBeNull()
  })

  it('S-15: reactivar vuelve a comprobar el tope', async () => {
    // Si no lo comprobara, bastaria con pausar, crear y reactivar para tener 15.
    const { data: pausados } = await parent
      .from('seller_payment_reminders')
      .select('id')
      .eq('status', 'paused')
      .limit(1)

    const { error } = await parent.rpc('set_payment_reminder_status', {
      p_id: pausados![0]!.id,
      p_status: 'active',
    })
    expect(error?.message).toMatch(/14 recordatorios activos/i)
  })

  it('S-16: el tope tampoco se salta por la puerta de atras', async () => {
    const { error } = await ctx.svc.from('seller_payment_reminders').insert({
      organization_id: ctx.demoOrg.id,
      seller_id: parentId,
      weekday: 3,
      time_of_day: '23:45:00',
    })
    expect(error?.message).toMatch(/14 recordatorios activos/i)
  })
})

// =============================================================================
describe('S — el reloj (BR-S03)', () => {
  /**
   * `next_reminder_run_at` es la pieza de la que depende el motor de la etapa 3.
   * Se prueba con un instante FIJO en vez de con `now()`: una prueba que depende
   * del dia en que se ejecuta falla sola algun martes.
   *
   * 2026-09-15T20:00:00Z son las 15:00 del MARTES en Bogota (UTC-5).
   */
  const MARTES_15H = '2026-09-15T20:00:00Z'

  async function proximo(weekday: number, time: string, from = MARTES_15H) {
    const { rows } = await db.query(
      `select next_reminder_run_at($1::smallint, $2::time, $3::timestamptz) as v`,
      [weekday, time, from],
    )
    return (rows[0].v as Date).toISOString()
  }

  it('S-17: mas tarde el mismo dia, es hoy', async () => {
    // Martes 19:00 en Bogota = 00:00 UTC del miercoles.
    expect(await proximo(2, '19:00')).toBe('2026-09-16T00:00:00.000Z')
  })

  it('S-18: a la hora exacta, ya paso: es la semana siguiente', async () => {
    // Estrictamente posterior. Si fuera «>=», el motor lo dispararia dos veces
    // en el mismo minuto.
    expect(await proximo(2, '15:00')).toBe('2026-09-22T20:00:00.000Z')
  })

  it('S-19: mas temprano el mismo dia, es el martes que viene', async () => {
    expect(await proximo(2, '10:00')).toBe('2026-09-22T15:00:00.000Z')
  })

  it('S-20: el lunes que viene, no el de ayer', async () => {
    expect(await proximo(1, '08:00')).toBe('2026-09-21T13:00:00.000Z')
  })

  it('S-21: el domingo a las 23:59 cae en lunes UTC, y eso es correcto', async () => {
    // La prueba de que se calcula en Bogota y no en UTC: 23:59 del domingo 20
    // en Bogota son las 04:59 del lunes 21 en UTC.
    expect(await proximo(7, '23:59')).toBe('2026-09-21T04:59:00.000Z')
  })

  it('S-22: medianoche del mismo dia ya paso a las 15:00', async () => {
    expect(await proximo(2, '00:00')).toBe('2026-09-22T05:00:00.000Z')
  })

  it('S-23: el recordatorio guarda el proximo disparo al crearse', async () => {
    await limpiarDe(memberId)
    const { data, error } = await member.rpc('create_payment_reminder', {
      p_weekday: 3,
      p_time_of_day: '18:30:00',
    })
    expect(error).toBeNull()

    const { rows } = await db.query(
      `select next_reminder_run_at(3::smallint, '18:30'::time) as v`,
    )
    expect(new Date(data!.next_run_at).toISOString()).toBe((rows[0].v as Date).toISOString())
    // Y siempre esta en el futuro.
    expect(new Date(data!.next_run_at).getTime()).toBeGreaterThan(Date.now())
  })

  it('S-24: cambiar la hora recalcula el proximo disparo', async () => {
    const { data: mios } = await member.from('seller_payment_reminders').select('id, next_run_at')
    const antes = mios![0]!.next_run_at

    const { data: cambiado, error } = await member.rpc('update_payment_reminder', {
      p_id: mios![0]!.id,
      p_weekday: 5,
      p_time_of_day: '06:45:00',
    })
    expect(error).toBeNull()
    expect(cambiado!.next_run_at).not.toBe(antes)

    const { rows } = await db.query(
      `select next_reminder_run_at(5::smallint, '06:45'::time) as v`,
    )
    expect(new Date(cambiado!.next_run_at).toISOString()).toBe((rows[0].v as Date).toISOString())
  })

  it('S-25: un cambio que NO toca el horario deja el reloj quieto', async () => {
    // Es la mitad importante para la etapa 3: el motor adelantara `next_run_at`
    // a la semana siguiente, y un trigger que recalculara en cada update pisaria
    // ese avance y dejaria el recordatorio disparando en bucle.
    const { data: mios } = await member
      .from('seller_payment_reminders')
      .select('id, weekday, time_of_day, next_run_at')
    const antes = mios![0]!.next_run_at

    const { data: cambiado } = await member.rpc('update_payment_reminder', {
      p_id: mios![0]!.id,
      p_weekday: mios![0]!.weekday,
      p_time_of_day: mios![0]!.time_of_day,
      p_use_custom_message: true,
      p_custom_message: 'Solo cambio el texto.',
    })
    expect(cambiado!.next_run_at).toBe(antes)

    // Y una escritura directa del reloj, como hara el motor, tampoco lo dispara.
    const futuro = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
    const { data: avanzado } = await ctx.svc
      .from('seller_payment_reminders')
      .update({ next_run_at: futuro, last_run_at: new Date().toISOString() })
      .eq('id', mios![0]!.id)
      .select('next_run_at')
      .single()
    expect(new Date(avanzado!.next_run_at).toISOString()).toBe(futuro)
  })

  it('S-26: pausar y reactivar pone el reloj en el proximo futuro', async () => {
    const { data: mios } = await member.from('seller_payment_reminders').select('id')
    await member.rpc('set_payment_reminder_status', { p_id: mios![0]!.id, p_status: 'paused' })

    const { data: reactivado, error } = await member.rpc('set_payment_reminder_status', {
      p_id: mios![0]!.id,
      p_status: 'active',
    })
    expect(error).toBeNull()
    expect(new Date(reactivado!.next_run_at).getTime()).toBeGreaterThan(Date.now())
  })
})

// =============================================================================
describe('catalogo: privilegios de lo que trajo la 0051', () => {
  const RPC_PUBLICAS = [
    'archive_seller_payment_account',
    'create_payment_reminder',
    'create_seller_payment_account',
    'reorder_seller_payment_accounts',
    'restore_seller_payment_account',
    'set_payment_reminder_status',
    'update_payment_reminder',
    'update_seller_payment_account',
  ]

  const INTERNAS = [
    'max_active_payment_reminders',
    'next_reminder_run_at',
    'reminders_enforce_active_limit',
    'reminders_sync_next_run',
    'require_seller_org',
  ]

  it('las 8 RPC del vendedor SI son ejecutables por authenticated', async () => {
    const { rows } = await db.query(
      `select p.proname from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = any ($1)
          and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        order by p.proname`,
      [RPC_PUBLICAS],
    )
    expect(rows.map((r) => r.proname)).toEqual(RPC_PUBLICAS)
  })

  it('las internas NO son ejecutables desde una sesion (I-078)', async () => {
    const { rows } = await db.query(
      `select p.proname from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = any ($1)
          and has_function_privilege('authenticated', p.oid, 'EXECUTE')`,
      [INTERNAS],
    )
    expect(rows.map((r) => r.proname)).toEqual([])
  })

  it('ninguna es ejecutable por anon (I-020)', async () => {
    const { rows } = await db.query(
      `select p.proname from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = any ($1)
          and has_function_privilege('anon', p.oid, 'EXECUTE')`,
      [[...RPC_PUBLICAS, ...INTERNAS]],
    )
    expect(rows.map((r) => r.proname)).toEqual([])
  })

  it('las dos tablas nuevas no conceden DELETE ni INSERT ni UPDATE a authenticated', async () => {
    const { rows } = await db.query(`
      select table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee = 'authenticated'
        and table_name in ('seller_payment_accounts', 'seller_payment_reminders')
        and privilege_type <> 'SELECT'
      order by table_name, privilege_type
    `)
    expect(rows).toEqual([])
  })

  it('no existe ninguna politica que no sea de SELECT', async () => {
    const { rows } = await db.query(`
      select tablename, policyname, cmd
      from pg_policies
      where schemaname = 'public'
        and tablename in ('seller_payment_accounts', 'seller_payment_reminders')
        and cmd <> 'SELECT'
    `)
    expect(rows).toEqual([])
  })

  it('la bitacora NO guarda el numero de la cuenta (BR-D04)', async () => {
    // `audit_logs` lo consulta el personal entero, asi que volcar ahi la cuenta
    // bancaria desharia el aislamiento por la puerta de atras.
    await limpiarDe(ctx.ids.seller2)
    const seller2Client = await signInAs(USERS.seller2)
    const { error } = await seller2Client.rpc('create_seller_payment_account', {
      p_kind: 'bank',
      p_holder_name: 'Quien Sea',
      p_bank_name: 'Bancolombia',
      p_account_type: 'savings',
      p_account_number: '9876543210',
    })
    expect(error).toBeNull()

    const { rows } = await db.query(`
      select new_values
      from audit_logs
      where action = 'payment_account.create'
      order by created_at desc
      limit 1
    `)
    const anotado = JSON.stringify(rows[0].new_values)
    expect(anotado).not.toContain('9876543210')
    expect(anotado).not.toContain('Quien Sea')
    expect(anotado).toContain('bank')
  })
})
