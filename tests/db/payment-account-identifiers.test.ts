/**
 * Cuentas para recibir pagos: Bre-B y «Otros» (BR-M03, BR-M04, BR-M08, BR-M10;
 * migraciones 0073 y 0074, D-209).
 *
 * Lo que se prueba aqui es lo que ninguna pantalla puede garantizar:
 *
 *   * que la llave o el identificador se GUARDA TAL CUAL —letras, simbolos,
 *     ceros iniciales, mayusculas— y solo pierde los espacios exteriores;
 *   * que dos llaves distintas NO son la misma cuenta por compartir digitos, y
 *     que la misma llave dos veces se rechaza al crear, al editar, al volver a
 *     usar y con dos peticiones a la vez;
 *   * que la regla es LA MISMA en el formulario, la RPC y el CHECK, punto de
 *     codigo por punto de codigo;
 *   * que Nequi, Daviplata y banco siguen exactamente como estaban, incluida la
 *     llamada que hace hoy el codigo desplegado;
 *   * y quien ejecuta cada funcion (I-132, D-207).
 *
 * Como la suite de la 0051: ninguna prueba usa la service role para el acto
 * probado (D-043). Cada una inicia sesion como un usuario real; la service role
 * solo prepara, comprueba los CHECK —que si se aplican con ella— y limpia. Los
 * vendedores son PROPIOS de esta suite (I-035).
 *
 * Los caracteres invisibles se construyen con `String.fromCodePoint`: este
 * archivo no contiene ninguno.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { identifierProblem } from '@/features/payment-accounts/accounts'
import { paymentAccountSchema } from '@/features/payment-accounts/schemas'
import { mapPgError } from '@/lib/errors'

import {
  anonClient,
  DB_URL,
  loadSeedContext,
  SEED_PASSWORD,
  signInAs,
  USERS,
  type Client,
} from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let db: PgClient

/** Dos vendedores propios, sin equipo, y un padre con su integrante. */
let sellerAId: string
let sellerA: Client
let sellerBId: string
let sellerB: Client
let parentId: string
let parent: Client
let memberId: string
let member: Client

let owner: Client
let admin: Client
let controlSeller: Client

const createdProfileIds: string[] = []

const cp = (codePoint: number) => String.fromCodePoint(codePoint)

const FRASES = {
  brebVacia: 'Escribe tu llave.',
  otrosVacio: 'Escribe el número o identificador.',
  brebLarga: 'La llave es demasiado larga. Usa 100 caracteres como máximo.',
  otrosLargo: 'El número o identificador es demasiado largo. Usa 100 caracteres como máximo.',
  brebInvisible:
    'La llave tiene saltos de línea o caracteres invisibles. Escríbela de nuevo en una sola línea.',
  otrosInvisible:
    'El número o identificador tiene saltos de línea o caracteres invisibles. Escríbelo de nuevo en una sola línea.',
  duplicada: 'Ya tienes una cuenta igual en tu lista.',
  tope: 'Ya tienes 5 cuentas activas, que es el máximo. Archiva una para agregar otra.',
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

async function addSeller(email: string, name: string, parentSellerId?: string) {
  const id = await createAuthUser(email, name)
  const { error } = await ctx.svc.from('memberships').insert({
    organization_id: ctx.demoOrg.id,
    profile_id: id,
    role: 'seller',
    ...(parentSellerId ? { parent_seller_id: parentSellerId, invited_by: parentSellerId } : {}),
  })
  if (error) throw error
  return id
}

/** Deja a un vendedor sin cuentas, para que una prueba parta de cero. */
async function limpiarDe(sellerId: string) {
  await ctx.svc.from('seller_payment_accounts').delete().eq('seller_id', sellerId)
}

/** Crea una Bre-B o una «Otros» del vendedor que llama, como la aplicacion. */
function crear(
  client: Client,
  kind: 'breb' | 'other',
  identifier: string | undefined,
  options: { holder?: string; label?: string } = {},
) {
  return client.rpc('create_seller_payment_account', {
    p_kind: kind,
    p_holder_name: options.holder ?? 'Ana Torres',
    ...(identifier === undefined ? {} : { p_identifier: identifier }),
    ...(options.label === undefined ? {} : { p_label: options.label }),
  })
}

/** Las activas del vendedor que llama, en su orden. */
async function activas(client: Client) {
  const { data, error } = await client
    .from('seller_payment_accounts')
    .select('id, kind, identifier, phone, account_number, sort_order')
    .is('archived_at', null)
    .order('sort_order')
  if (error) throw new Error(error.message)
  return data
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  owner = await signInAs(USERS.owner)
  admin = await signInAs(USERS.admin)
  controlSeller = await signInAs(USERS.otherOrgSeller)

  const stamp = Date.now().toString(36)
  const emailA = `cuentas-mi-a-${stamp}@demo.test`
  const emailB = `cuentas-mi-b-${stamp}@demo.test`
  const emailParent = `cuentas-mi-padre-${stamp}@demo.test`
  const emailMember = `cuentas-mi-equipo-${stamp}@demo.test`

  sellerAId = await addSeller(emailA, 'Vendedora Llaves')
  sellerBId = await addSeller(emailB, 'Vendedor Llaves')
  parentId = await addSeller(emailParent, 'Padre Llaves')
  memberId = await addSeller(emailMember, 'Integrante Llaves', parentId)

  sellerA = await signInAs(emailA)
  sellerB = await signInAs(emailB)
  parent = await signInAs(emailParent)
  member = await signInAs(emailMember)
})

afterAll(async () => {
  // Orden obligatorio: las cuentas referencian la membresia con `on delete restrict`.
  for (const id of createdProfileIds) await limpiarDe(id)
  if (createdProfileIds.length > 0) {
    await ctx.svc.from('memberships').delete().in('profile_id', createdProfileIds)
    for (const id of createdProfileIds) await ctx.svc.auth.admin.deleteUser(id)
  }
  await db.end()
})

// =============================================================================
describe('MI — se guardan tal cual (BR-M04, BR-M10)', () => {
  it('MI-01: una Bre-B se crea y se vuelve a leer con su llave exacta', async () => {
    await limpiarDe(sellerAId)
    const { data, error } = await crear(sellerA, 'breb', '@Maria_07.x', { label: 'La del negocio' })
    expect(error).toBeNull()
    expect(data).toMatchObject({
      kind: 'breb',
      identifier: '@Maria_07.x',
      holder_name: 'Ana Torres',
      phone: null,
      bank_name: null,
      account_type: null,
      account_number: null,
      label: 'La del negocio',
      sort_order: 1,
      archived_at: null,
    })

    const leidas = await activas(sellerA)
    expect(leidas.map((c) => c.identifier)).toEqual(['@Maria_07.x'])
  })

  it('MI-02: «Otros» conserva letras, ceros iniciales, mayusculas y simbolos', async () => {
    await limpiarDe(sellerAId)
    for (const valor of ['0012-AbC/#ñ', 'ana.torres@correo.com', '000123', '+57 (300) 123*4567']) {
      const { data, error } = await crear(sellerA, 'other', valor)
      expect(error, valor).toBeNull()
      expect(data!.identifier, valor).toBe(valor)
      expect(data!.kind).toBe('other')
    }
  })

  it('MI-03: una llave sin «@» no gana ninguno, y una con «@» no lo pierde', async () => {
    await limpiarDe(sellerAId)
    const sin = await crear(sellerA, 'breb', 'maria')
    const con = await crear(sellerA, 'breb', '@maria')
    expect(sin.data!.identifier).toBe('maria')
    expect(con.data!.identifier).toBe('@maria')
  })

  it('MI-04: se quitan SOLO los espacios exteriores —los de trim()—, y los de dentro se quedan', async () => {
    await limpiarDe(sellerAId)
    const delante = ` ${cp(0x09)}${cp(0xa0)}${cp(0xfeff)}`
    const detras = `${cp(0x0a)}${cp(0x3000)} `
    const { data, error } = await crear(sellerA, 'other', `${delante}Movii 300 123 4567${detras}`)
    expect(error).toBeNull()
    expect(data!.identifier).toBe('Movii 300 123 4567')
  })

  it('MI-05: editar cambia la llave y el titular, y el tipo sigue siendo el mismo', async () => {
    await limpiarDe(sellerAId)
    const { data: creada } = await crear(sellerA, 'breb', '@antes')

    const { data, error } = await sellerA.rpc('update_seller_payment_account', {
      p_id: creada!.id,
      p_holder_name: 'Ana María Torres',
      p_identifier: '  @despues  ',
    })
    expect(error).toBeNull()
    expect(data).toMatchObject({
      kind: 'breb',
      identifier: '@despues',
      holder_name: 'Ana María Torres',
    })

    // Sin llave, lo dice por su nombre, y no cambia nada.
    const vacia = await sellerA.rpc('update_seller_payment_account', {
      p_id: creada!.id,
      p_holder_name: 'Otra Persona',
    })
    expect(vacia.error?.message).toBe(FRASES.brebVacia)
    const { data: intacta } = await sellerA
      .from('seller_payment_accounts')
      .select('identifier, holder_name')
      .eq('id', creada!.id)
      .single()
    expect(intacta).toEqual({ identifier: '@despues', holder_name: 'Ana María Torres' })
  })
})

// =============================================================================
describe('MI — duplicados (BR-M08)', () => {
  it('MI-06: llaves distintas NO son la misma cuenta por compartir digitos, ni por no tener ninguno', async () => {
    await limpiarDe(sellerAId)
    for (const valor of ['@maria123', '@pedro123', '@maria', '@pedro', '@Maria']) {
      const { error } = await crear(sellerA, 'breb', valor)
      expect(error, valor).toBeNull()
    }
    expect((await activas(sellerA)).map((c) => c.identifier)).toEqual([
      '@maria123',
      '@pedro123',
      '@maria',
      '@pedro',
      '@Maria',
    ])
  })

  it('MI-07: la misma llave dos veces se rechaza, tambien con espacios alrededor', async () => {
    await limpiarDe(sellerAId)
    expect((await crear(sellerA, 'breb', '@maria')).error).toBeNull()

    for (const repetida of ['@maria', '  @maria  ', `${cp(0xa0)}@maria${cp(0x09)}`]) {
      const { error } = await crear(sellerA, 'breb', repetida)
      expect(error?.code, JSON.stringify(repetida)).toBe('23505')
      expect(error!.message).toMatch(/seller_payment_accounts_no_duplicates/)
      // Y lo que lee el vendedor es una frase, no el nombre del indice.
      expect(mapPgError(error)).toBe(FRASES.duplicada)
    }
    expect(await activas(sellerA)).toHaveLength(1)
  })

  it('MI-08: la misma llave en OTRA forma, el mismo numero en Nequi y en Bre-B, y otro vendedor: conviven', async () => {
    await limpiarDe(sellerAId)
    await limpiarDe(sellerBId)
    expect((await crear(sellerA, 'breb', '3001234567')).error).toBeNull()
    expect((await crear(sellerA, 'other', '3001234567')).error).toBeNull()
    const nequi = await sellerA.rpc('create_seller_payment_account', {
      p_kind: 'nequi',
      p_holder_name: 'Ana Torres',
      p_phone: '300 123 4567',
    })
    expect(nequi.error).toBeNull()
    expect((await crear(sellerB, 'breb', '3001234567')).error).toBeNull()
  })

  it('MI-09: editar hacia una llave que ya esta se rechaza; editarse a si misma, no', async () => {
    await limpiarDe(sellerAId)
    const { data: una } = await crear(sellerA, 'breb', '@una')
    const { data: otra } = await crear(sellerA, 'breb', '@otra')

    const choque = await sellerA.rpc('update_seller_payment_account', {
      p_id: otra!.id,
      p_holder_name: 'Ana Torres',
      p_identifier: ' @una',
    })
    expect(choque.error?.code).toBe('23505')
    expect(mapPgError(choque.error)).toBe(FRASES.duplicada)

    const misma = await sellerA.rpc('update_seller_payment_account', {
      p_id: una!.id,
      p_holder_name: 'Ana Torres Ruiz',
      p_identifier: '@una',
    })
    expect(misma.error).toBeNull()
  })

  it('MI-10: una archivada no impide crear la misma, pero volver a usarla con la otra activa se rechaza', async () => {
    await limpiarDe(sellerAId)
    const { data: vieja } = await crear(sellerA, 'other', 'ABC-123')
    await sellerA.rpc('archive_seller_payment_account', { p_id: vieja!.id })

    const nueva = await crear(sellerA, 'other', 'ABC-123')
    expect(nueva.error).toBeNull()

    const volver = await sellerA.rpc('restore_seller_payment_account', { p_id: vieja!.id })
    expect(volver.error?.code).toBe('23505')
    expect(mapPgError(volver.error)).toBe(FRASES.duplicada)

    // Sigue archivada: el rechazo no dejo nada a medias.
    const { data } = await sellerA
      .from('seller_payment_accounts')
      .select('archived_at, sort_order')
      .eq('id', vieja!.id)
      .single()
    expect(data!.archived_at).not.toBeNull()
    expect(data!.sort_order).toBeNull()
  })
})

// =============================================================================
describe('MI — lo que no vale (BR-M10)', () => {
  it('MI-11: vacia o solo espacios, lo dice por su nombre en cada forma, y no guarda nada', async () => {
    await limpiarDe(sellerAId)
    expect((await crear(sellerA, 'breb', undefined)).error?.message).toBe(FRASES.brebVacia)
    expect((await crear(sellerA, 'breb', `  ${cp(0xa0)} `)).error?.message).toBe(FRASES.brebVacia)
    expect((await crear(sellerA, 'other', '')).error?.message).toBe(FRASES.otrosVacio)
    expect(await activas(sellerA)).toEqual([])
  })

  it('MI-12: 100 caracteres caben y 101 no; un emoji cuenta como uno', async () => {
    await limpiarDe(sellerAId)
    expect((await crear(sellerA, 'breb', 'a'.repeat(100))).error).toBeNull()
    expect((await crear(sellerA, 'other', 'b'.repeat(99) + cp(0x1f600))).error).toBeNull()
    expect((await crear(sellerA, 'breb', 'c'.repeat(101))).error?.message).toBe(FRASES.brebLarga)
    expect((await crear(sellerA, 'other', 'd'.repeat(101))).error?.message).toBe(FRASES.otrosLargo)
    expect(await activas(sellerA)).toHaveLength(2)
  })

  it('MI-13: saltos de linea y caracteres invisibles, en cualquier posicion interior', async () => {
    await limpiarDe(sellerAId)
    for (const invisible of [
      0x0a, 0x0d, 0x09, 0x85, 0xad, 0x200b, 0x200f, 0x2028, 0x202e, 0x2066, 0xfeff,
    ]) {
      const hex = invisible.toString(16)
      expect((await crear(sellerA, 'breb', `@ma${cp(invisible)}ria`)).error?.message, hex).toBe(
        FRASES.brebInvisible,
      )
      expect((await crear(sellerA, 'other', `12${cp(invisible)}34`)).error?.message, hex).toBe(
        FRASES.otrosInvisible,
      )
    }
    expect(await activas(sellerA)).toEqual([])
  })

  it('MI-14: por la puerta de atras tampoco: los CHECK con la service role', async () => {
    await limpiarDe(sellerAId)
    const base = {
      organization_id: ctx.demoOrg.id,
      seller_id: sellerAId,
      holder_name: 'Ana Torres',
      sort_order: null as number | null,
      archived_at: new Date().toISOString(),
    }
    const casos: Array<[string, Record<string, unknown>, RegExp]> = [
      ['Bre-B sin llave', { kind: 'breb' }, /shape_by_kind/],
      [
        'Bre-B con telefono',
        { kind: 'breb', identifier: '@x', phone: '3001234567' },
        /shape_by_kind/,
      ],
      [
        'Nequi con llave',
        { kind: 'nequi', phone: '3001234567', identifier: '@x' },
        /shape_by_kind/,
      ],
      [
        '«Otros» con banco',
        { kind: 'other', identifier: 'x', bank_name: 'Bancolombia' },
        /shape_by_kind/,
      ],
      ['llave sin recortar', { kind: 'breb', identifier: ' @x' }, /identifier_format/],
      [
        'llave con un tabulador detras',
        { kind: 'breb', identifier: `@x${cp(0x09)}` },
        /identifier_format/,
      ],
      [
        'llave demasiado larga',
        { kind: 'other', identifier: 'x'.repeat(101) },
        /identifier_format/,
      ],
      [
        'llave con salto de linea',
        { kind: 'breb', identifier: `@a${cp(0x0a)}b` },
        /identifier_format/,
      ],
      ['llave vacia', { kind: 'other', identifier: '' }, /identifier_format/],
    ]
    for (const [nombre, valores, restriccion] of casos) {
      const { error } = await ctx.svc
        .from('seller_payment_accounts')
        .insert({ ...base, ...valores } as never)
      expect(error?.message, nombre).toMatch(restriccion)
    }

    // Y una bien escrita SI entra con la service role: los CHECK llaman a las
    // dos funciones de la regla, y la service role puede ejecutarlas.
    const buena = await ctx.svc
      .from('seller_payment_accounts')
      .insert({ ...base, kind: 'breb', identifier: '@Bien.Escrita' })
      .select('identifier')
      .single()
    expect(buena.error).toBeNull()
    expect(buena.data!.identifier).toBe('@Bien.Escrita')
  })
})

// =============================================================================
describe('MI — la misma regla en las tres capas (BR-M10)', () => {
  it('MI-15: la base y TypeScript dicen lo mismo de cada punto de codigo de la BMP', async () => {
    const { rows } = await db.query<{ c: number; prohibido: boolean; recortado: boolean }>(`
      select c,
             payment_account_identifier_problem('breb', 'a' || chr(c) || 'b') is not null as prohibido,
             payment_account_identifier_trim(chr(c) || 'a' || chr(c)) = 'a' as recortado
        from generate_series(1, 65535) c
       where c not between 55296 and 57343
       order by c`)
    expect(rows.length).toBe(65535 - 2048)

    const distintos: string[] = []
    for (const { c, prohibido, recortado } of rows) {
      const ch = cp(c)
      const tsProhibido = identifierProblem('breb', `a${ch}b`) !== null
      const tsRecortado = `${ch}a${ch}`.trim() === 'a'
      if (tsProhibido !== prohibido || tsRecortado !== recortado) {
        distintos.push(
          `U+${c.toString(16).padStart(4, '0')} base=${prohibido}/${recortado} ts=${tsProhibido}/${tsRecortado}`,
        )
      }
    }
    expect(distintos).toEqual([])

    // Fuera de la BMP, unos cuantos: un emoji y dos de formato que NO estan en
    // la lista (no se amplía por analogía).
    for (const c of [0x1f600, 0xe0001, 0x1d173, 0x10ffff]) {
      const {
        rows: [r],
      } = await db.query<{ prohibido: boolean }>(
        `select payment_account_identifier_problem('breb', 'a' || chr($1::int) || 'b') is not null as prohibido`,
        [c],
      )
      expect(r!.prohibido, c.toString(16)).toBe(identifierProblem('breb', `a${cp(c)}b`) !== null)
    }
  })

  it('MI-16: el formulario y la RPC aceptan y rechazan lo mismo, y guardan lo mismo', async () => {
    await limpiarDe(sellerAId)
    const corpus = [
      '@maria',
      '  @maria  ',
      `${cp(0xa0)}@maria${cp(0x09)}`,
      'maria',
      'MARIA',
      '0012',
      'Cuenta Ñandú #12',
      `x${cp(0x1f600)}`,
      '',
      '   ',
      'a'.repeat(100),
      'a'.repeat(101),
      `@ma${cp(0x0a)}ria`,
      `@ma${cp(0x200b)}ria`,
      `@ma${cp(0xa0)}ria`,
    ]
    for (const entrada of corpus) {
      const zod = paymentAccountSchema.safeParse({
        kind: 'breb',
        holderName: 'Ana Torres',
        phone: '',
        bankName: '',
        accountType: null,
        accountNumber: '',
        identifier: entrada,
        label: '',
      })
      // La Server Action manda lo que sale de Zod; aqui se manda la ENTRADA
      // cruda, que es lo que haria cualquiera llamando a la RPC por su cuenta.
      const { data, error } = await crear(sellerA, 'breb', entrada)
      const etiqueta = JSON.stringify(entrada)
      if (zod.success) {
        expect(error, etiqueta).toBeNull()
        expect(data!.identifier, etiqueta).toBe(zod.data.identifier)
        // Archivada enseguida: libera el cupo y la llave para la siguiente.
        await sellerA.rpc('archive_seller_payment_account', { p_id: data!.id })
      } else {
        expect(error?.message, etiqueta).toBe(zod.error.issues[0]?.message)
      }
    }
  })
})

// =============================================================================
describe('MI — Nequi, Daviplata y banco, como estaban', () => {
  it('MI-17: la llamada de hoy, sin `p_identifier`, sigue funcionando en las tres', async () => {
    await limpiarDe(sellerAId)
    const nequi = await sellerA.rpc('create_seller_payment_account', {
      p_kind: 'nequi',
      p_holder_name: 'Ana Torres',
      p_phone: '300 111 2233',
    })
    const daviplata = await sellerA.rpc('create_seller_payment_account', {
      p_kind: 'daviplata',
      p_holder_name: 'Ana Torres',
      p_phone: '3004445566',
    })
    const banco = await sellerA.rpc('create_seller_payment_account', {
      p_kind: 'bank',
      p_holder_name: 'Ana Torres',
      p_bank_name: 'Bancolombia',
      p_account_type: 'savings',
      p_account_number: '123-456-789',
    })
    for (const r of [nequi, daviplata, banco]) {
      expect(r.error).toBeNull()
      expect(r.data!.identifier).toBeNull()
    }

    // Y editar con la llamada de hoy tambien.
    const editada = await sellerA.rpc('update_seller_payment_account', {
      p_id: nequi.data!.id,
      p_holder_name: 'Ana María Torres',
      p_phone: '300 111 2233',
    })
    expect(editada.error).toBeNull()
    expect(editada.data).toMatchObject({ phone: '300 111 2233', identifier: null })
  })

  it('MI-18: siguen comparando SOLO digitos', async () => {
    await limpiarDe(sellerAId)
    const nequi = (phone: string) =>
      sellerA.rpc('create_seller_payment_account', {
        p_kind: 'nequi',
        p_holder_name: 'Ana Torres',
        p_phone: phone,
      })
    const banco = (number: string) =>
      sellerA.rpc('create_seller_payment_account', {
        p_kind: 'bank',
        p_holder_name: 'Ana Torres',
        p_bank_name: 'Bancolombia',
        p_account_type: 'savings',
        p_account_number: number,
      })

    expect((await nequi('300 123 4567')).error).toBeNull()
    const repetido = await nequi('3001234567')
    expect(repetido.error?.code).toBe('23505')
    expect(mapPgError(repetido.error)).toBe(FRASES.duplicada)

    expect((await banco('123-456-789')).error).toBeNull()
    expect((await banco('123456789')).error?.code).toBe('23505')
  })

  it('MI-19: un Nequi no lleva llave, y su telefono sigue sin aceptar letras', async () => {
    await limpiarDe(sellerAId)
    const conLlave = await sellerA.rpc('create_seller_payment_account', {
      p_kind: 'nequi',
      p_holder_name: 'Ana Torres',
      p_phone: '3001234567',
      p_identifier: '@maria',
    })
    expect(conLlave.error?.message).toMatch(/shape_by_kind/)

    const conLetras = await sellerA.rpc('create_seller_payment_account', {
      p_kind: 'nequi',
      p_holder_name: 'Ana Torres',
      p_phone: '@maria',
    })
    expect(conLetras.error?.message).toMatch(/phone_format/)
    expect(await activas(sellerA)).toEqual([])
  })
})

// =============================================================================
describe('MI — tope, orden, archivo y aislamiento (BR-M02, BR-M05..BR-M07)', () => {
  it('MI-20: el tope de cinco cuenta las cinco formas, y la sexta se rechaza con su frase', async () => {
    await limpiarDe(sellerAId)
    const creadas = [
      await sellerA.rpc('create_seller_payment_account', {
        p_kind: 'nequi',
        p_holder_name: 'Ana Torres',
        p_phone: '3001112233',
      }),
      await sellerA.rpc('create_seller_payment_account', {
        p_kind: 'daviplata',
        p_holder_name: 'Ana Torres',
        p_phone: '3001112233',
      }),
      await sellerA.rpc('create_seller_payment_account', {
        p_kind: 'bank',
        p_holder_name: 'Ana Torres',
        p_bank_name: 'Bancolombia',
        p_account_type: 'checking',
        p_account_number: '555-555',
      }),
      await crear(sellerA, 'breb', '@quinta-menos-una'),
      await crear(sellerA, 'other', 'la-quinta'),
    ]
    for (const r of creadas) expect(r.error).toBeNull()

    const sexta = await crear(sellerA, 'breb', '@sexta')
    expect(sexta.error?.message).toBe(FRASES.tope)
  })

  it('MI-21: se reordenan, se archivan y se vuelven a usar como las demas', async () => {
    await limpiarDe(sellerAId)
    const { data: k } = await crear(sellerA, 'breb', '@primera')
    const { data: o } = await crear(sellerA, 'other', 'segunda')

    const orden = await sellerA.rpc('reorder_seller_payment_accounts', { p_ids: [o!.id, k!.id] })
    expect(orden.error).toBeNull()
    expect(orden.data!.map((c) => [c.identifier, c.sort_order])).toEqual([
      ['segunda', 1],
      ['@primera', 2],
    ])

    const archivada = await sellerA.rpc('archive_seller_payment_account', { p_id: k!.id })
    expect(archivada.data).toMatchObject({ identifier: '@primera', sort_order: null })

    const vuelta = await sellerA.rpc('restore_seller_payment_account', { p_id: k!.id })
    expect(vuelta.error).toBeNull()
    expect(vuelta.data).toMatchObject({ identifier: '@primera', sort_order: 2, archived_at: null })
  })

  it('MI-22: nadie mas ve una Bre-B: otro vendedor, el personal, el vendedor padre ni otra organizacion', async () => {
    await limpiarDe(memberId)
    expect((await crear(member, 'breb', '@solo-mia')).error).toBeNull()

    for (const [quien, cliente] of [
      ['otro vendedor', sellerB],
      ['Dueño', owner],
      ['Administrador', admin],
      ['vendedor padre', parent],
      ['otra organizacion', controlSeller],
    ] as const) {
      const { data, error } = await cliente
        .from('seller_payment_accounts')
        .select('id')
        .eq('identifier', '@solo-mia')
      expect(error, quien).toBeNull()
      expect(data, quien).toEqual([])
    }

    const visitante = await anonClient().from('seller_payment_accounts').select('id')
    expect(visitante.error).not.toBeNull()
  })

  it('MI-23: una Bre-B ajena no se puede editar ni archivar, y queda intacta', async () => {
    const { data: ajena } = await member
      .from('seller_payment_accounts')
      .select('id')
      .eq('identifier', '@solo-mia')
      .single()

    const editar = await sellerB.rpc('update_seller_payment_account', {
      p_id: ajena!.id,
      p_holder_name: 'Robada',
      p_identifier: '@robada',
    })
    expect(editar.error?.message).toMatch(/no existe/i)

    const archivar = await sellerB.rpc('archive_seller_payment_account', { p_id: ajena!.id })
    expect(archivar.error?.message).toMatch(/no existe/i)

    const { data } = await member
      .from('seller_payment_accounts')
      .select('identifier, holder_name, archived_at')
      .eq('id', ajena!.id)
      .single()
    expect(data).toEqual({ identifier: '@solo-mia', holder_name: 'Ana Torres', archived_at: null })
  })

  it('MI-24: la bitacora no guarda la llave ni el titular (BR-D04)', async () => {
    await limpiarDe(sellerAId)
    const { data } = await crear(sellerA, 'breb', '@secreta-crear', { holder: 'Titular Secreta' })
    await sellerA.rpc('update_seller_payment_account', {
      p_id: data!.id,
      p_holder_name: 'Titular Secreta',
      p_identifier: '@secreta-editar',
    })

    const { rows } = await db.query<{ action: string; nuevo: string }>(
      `select action, new_values::text as nuevo
         from audit_logs
        where entity_id = $1
        order by id`,
      [data!.id],
    )
    expect(rows.map((r) => r.action)).toEqual(['payment_account.create', 'payment_account.update'])
    for (const { nuevo } of rows) {
      expect(nuevo).not.toContain('secreta')
      expect(nuevo).not.toContain('Titular')
      expect(nuevo).toContain('breb')
    }
  })
})

// =============================================================================
/**
 * Dos transacciones de verdad, en un orden fijo (la leccion de I-134: una que
 * «solo espera» no demuestra nada; hay que ver como acaban las dos). Cada una
 * con la identidad del vendedor y el rol `authenticated`, como la sesion que
 * entra por PostgREST.
 */
describe('MI — dos peticiones a la vez con la misma llave (BR-M08)', () => {
  async function abrirComo(sellerId: string) {
    const c = new PgClient({ connectionString: DB_URL })
    await c.connect()
    const { rows } = await c.query<{ pid: number }>('select pg_backend_pid() as pid')
    await c.query('begin')
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: sellerId, role: 'authenticated' }),
    ])
    await c.query('set local role authenticated')
    return { c, pid: rows[0]!.pid }
  }

  const insertar = (c: PgClient) =>
    c.query(
      `select (create_seller_payment_account('breb', 'Ana Torres', p_identifier => '@carrera')).id`,
    )

  async function esperarBloqueo(pid: number) {
    for (let i = 0; i < 100; i++) {
      const { rows } = await db.query<{ w: string | null }>(
        'select wait_event_type as w from pg_stat_activity where pid = $1',
        [pid],
      )
      if (rows[0]?.w === 'Lock') return
      await new Promise((r) => setTimeout(r, 50))
    }
    throw new Error('La segunda transaccion no llego a esperar a la primera')
  }

  it('MI-25: la segunda espera a la primera y, cuando esta confirma, falla; queda UNA', async () => {
    await limpiarDe(sellerAId)
    const a = await abrirComo(sellerAId)
    const b = await abrirComo(sellerAId)
    try {
      await insertar(a.c)
      const segunda = insertar(b.c).then(
        () => ({ ok: true as const }),
        (e: { code?: string; message: string }) => ({
          ok: false as const,
          code: e.code,
          message: e.message,
        }),
      )
      await esperarBloqueo(b.pid)
      await a.c.query('commit')

      const resultado = await segunda
      expect(resultado).toMatchObject({ ok: false, code: '23505' })
      expect(resultado.ok ? '' : resultado.message).toMatch(/seller_payment_accounts_no_duplicates/)
    } finally {
      await b.c.query('rollback').catch(() => undefined)
      await a.c.end()
      await b.c.end()
    }

    const { rows } = await db.query(
      `select count(*)::int as n from seller_payment_accounts
        where seller_id = $1 and identifier = '@carrera' and archived_at is null`,
      [sellerAId],
    )
    expect(rows[0].n).toBe(1)
  })

  it('MI-26: si la primera se deshace, la segunda entra: el indice espera de verdad', async () => {
    await limpiarDe(sellerAId)
    const a = await abrirComo(sellerAId)
    const b = await abrirComo(sellerAId)
    try {
      await insertar(a.c)
      const segunda = insertar(b.c)
      await esperarBloqueo(b.pid)
      await a.c.query('rollback')
      await segunda
      await b.c.query('commit')
    } finally {
      await a.c.end()
      await b.c.end()
    }

    const { rows } = await db.query(
      `select count(*)::int as n from seller_payment_accounts
        where seller_id = $1 and identifier = '@carrera' and archived_at is null`,
      [sellerAId],
    )
    expect(rows[0].n).toBe(1)
  })
})

// =============================================================================
describe('MI — quien ejecuta cada funcion (I-132, D-207)', () => {
  const MATRIZ = [
    ['archive_seller_payment_account(uuid)', true, true],
    [
      'create_seller_payment_account(payment_account_kind,text,text,text,bank_account_type,text,text,text)',
      true,
      true,
    ],
    ['payment_account_identifier_problem(payment_account_kind,text)', false, true],
    ['payment_account_identifier_trim(text)', false, true],
    ['reorder_seller_payment_accounts(uuid[])', true, true],
    ['restore_seller_payment_account(uuid)', true, true],
    [
      'update_seller_payment_account(uuid,text,text,text,bank_account_type,text,text,text)',
      true,
      true,
    ],
  ] as const

  it('MI-27: el EXECUTE efectivo de las siete funciones de cuentas es exactamente el de la lista', async () => {
    const { rows } = await db.query<{
      firma: string
      publico: boolean
      anonimo: boolean
      autenticado: boolean
      servicio: boolean
    }>(
      `select p.oid::regprocedure::text as firma,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       where a.grantee = 0 and a.privilege_type = 'EXECUTE') as publico,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anonimo,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as autenticado,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as servicio
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and (p.proname like '%seller_payment_account%' or p.proname like 'payment_account_identifier%')
        order by 1`,
    )
    // Una fila por firma: la de la 0051 de crear y editar ya no existe.
    expect(rows.map((r) => r.firma)).toEqual(MATRIZ.map(([firma]) => firma))
    for (const [firma, autenticado, servicio] of MATRIZ) {
      const fila = rows.find((r) => r.firma === firma)!
      expect(fila, firma).toEqual({ firma, publico: false, anonimo: false, autenticado, servicio })
    }
  })

  it('MI-28: toda funcion que crean la 0073 y la 0074 esta en la lista, y ninguna mas', async () => {
    const { readFile } = await import('node:fs/promises')
    const nombres = new Set<string>()
    for (const archivo of [
      'supabase/migrations/0073_payment_account_kinds_breb_other.sql',
      'supabase/migrations/0074_payment_account_identifier.sql',
    ]) {
      const sql = (await readFile(archivo, 'utf8')).replace(/--.*$/gm, '')
      for (const m of sql.matchAll(
        /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi,
      )) {
        nombres.add(m[1]!.toLowerCase())
      }
    }
    expect([...nombres].sort()).toEqual([
      'create_seller_payment_account',
      'payment_account_identifier_problem',
      'payment_account_identifier_trim',
      'update_seller_payment_account',
    ])
  })

  it('MI-29: una sesion no ejecuta las dos funciones de la regla, ni por PostgREST', async () => {
    for (const cliente of [sellerA, anonClient()]) {
      const recorte = await cliente.rpc('payment_account_identifier_trim', { p_value: ' x ' })
      expect(recorte.error).not.toBeNull()
      const problema = await cliente.rpc('payment_account_identifier_problem', {
        p_kind: 'breb',
        p_value: '',
      })
      expect(problema.error).not.toBeNull()
    }
  })
})
