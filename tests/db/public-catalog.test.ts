/**
 * Catalogo publico de boletas por vendedor (migracion `0043`, D-159,
 * BR-K01..BR-K12).
 *
 * QUE SE PRUEBA AQUI, Y POR QUE ASI
 *
 * Esta es la unica lectura del proyecto que sirve datos SIN sesion, asi que las
 * pruebas van por los dos caminos que de verdad importan:
 *
 *   * Lo que puede hacer un VISITANTE: se usa el cliente `anon` real contra
 *     PostgREST, igual que lo haria alguien con la consola del navegador
 *     abierta. No basta con confiar en el `grant`: se comprueba que la llamada
 *     recibe un error de permisos.
 *   * Lo que devuelven las funciones: se invocan con `pg` como `postgres`,
 *     porque en local `service_role` no tiene sesion HTTP propia en estas
 *     pruebas y lo que se esta verificando es el CUERPO de la funcion —sus
 *     filtros y su proyeccion—, no el transporte.
 *
 * DATOS PROPIOS, NO LOS DEL SEED. La suite crea su propia rifa y sus propias
 * boletas: `public_catalog_tickets` devuelve TODO el inventario publicable de un
 * vendedor, y usar la rifa del seed haria que las boletas que dejan otras suites
 * cambiaran estas cuentas segun el orden de ejecucion (la trampa de I-035).
 *
 * Reglas cubiertas: BR-K01..BR-K12, y de rebote BR-N03 (ceros iniciales) y
 * BR-U07 (aislamiento entre vendedores y organizaciones).
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { anonClient, DB_URL, loadSeedContext, serviceClient, type Client } from './helpers'

const SLUG = 'catalogo-prueba-k7m4'
const OTRO_SLUG = 'catalogo-prueba-otra-org'
const WHATSAPP = '573001234567'

let db: PgClient
let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let svc: Client

let raffleId: string
let otraOrgRaffleId: string
/** Los numeros que esta suite publica, en el orden numerico que debe devolver. */
const DISPONIBLES = ['0007', '0025', '0100', '0101', '1300']
const TOMADAS = ['0009', '1234']
/** Estados que NO deben salir nunca (BR-K08). */
const OCULTAS: { estado: 'draft' | 'pending_approval' | 'cancelled'; daily: string }[] = [
  { estado: 'draft', daily: '4001' },
  { estado: 'pending_approval', daily: '4002' },
  { estado: 'cancelled', daily: '4003' },
]


/**
 * Desde `0046` una boleta publica son SUS DOS NUMEROS y nada mas: la columna
 * `taken` desaparecio porque ya no puede haber una boleta tomada en esta
 * proyeccion (D-164).
 */
type PublicTicket = { daily_number: string; weekly_number: string }

async function tickets(
  slug: string,
  opts: { search?: string | null; limit?: number; offset?: number } = {},
): Promise<PublicTicket[]> {
  const { rows } = await db.query<PublicTicket>(
    'select * from public_catalog_tickets($1, $2, $3, $4)',
    [slug, opts.search ?? null, opts.limit ?? 50, opts.offset ?? 0],
  )
  return rows
}

async function seller(slug: string) {
  const { rows } = await db.query('select * from public_catalog_seller($1)', [slug])
  return rows
}

/** Inserta una boleta ya en su estado final, con la service role. */
async function nuevaBoleta(values: {
  organization_id: string
  raffle_id: string
  seller_id: string
  daily: string
  weekly: string
  estado: 'draft' | 'pending_approval' | 'available' | 'assigned' | 'cancelled'
  client_id?: string
}) {
  const asignada = values.estado === 'assigned'
  const { data, error } = await svc
    .from('tickets')
    .insert({
      organization_id: values.organization_id,
      raffle_id: values.raffle_id,
      seller_id: values.seller_id,
      created_by: ctx.ids.owner,
      daily_number: values.daily,
      weekly_number: values.weekly,
      inventory_status: values.estado,
      ...(asignada
        ? {
            client_id: values.client_id,
            sale_price: 120_000,
            sale_date: '2026-01-15',
            assigned_at: new Date().toISOString(),
          }
        : {}),
      ...(values.estado === 'cancelled' ? { cancelled_at: new Date().toISOString() } : {}),
    })
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`No se pudo crear la boleta ${values.daily}: ${error.message}`)
  return data!.id
}

beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  ctx = await loadSeedContext()
  svc = serviceClient()

  // Restos de una ejecucion anterior que no llegara a limpiar: sin esto, la
  // segunda pasada choca contra `raffles_org_name_key` y la suite entera se
  // salta. Es la misma precaucion que pide I-059 sobre las suites que dejan
  // basura.
  await limpiar()

  // Rifa propia de esta suite, para que nadie mas meta boletas en la cuenta.
  const { data: raffle, error: raffleError } = await svc
    .from('raffles')
    .insert({
      organization_id: ctx.demoOrg.id,
      name: 'Rifa Catalogo Publico',
      ticket_price: 120_000,
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      status: 'active',
      created_by: ctx.ids.owner,
    })
    .select('id')
    .maybeSingle()
  if (raffleError) throw new Error(`No se pudo crear la rifa: ${raffleError.message}`)
  raffleId = raffle!.id

  for (const [i, daily] of DISPONIBLES.entries()) {
    await nuevaBoleta({
      organization_id: ctx.demoOrg.id,
      raffle_id: raffleId,
      seller_id: ctx.ids.seller1,
      daily,
      weekly: String(5000 + i),
      estado: 'available',
    })
  }
  for (const [i, daily] of TOMADAS.entries()) {
    await nuevaBoleta({
      organization_id: ctx.demoOrg.id,
      raffle_id: raffleId,
      seller_id: ctx.ids.seller1,
      daily,
      weekly: String(6000 + i),
      estado: 'assigned',
      client_id: ctx.clients.ana.id,
    })
  }
  for (const [i, oculta] of OCULTAS.entries()) {
    await nuevaBoleta({
      organization_id: ctx.demoOrg.id,
      raffle_id: raffleId,
      seller_id: ctx.ids.seller1,
      daily: oculta.daily,
      weekly: String(7000 + i),
      estado: oculta.estado,
    })
  }

  // Una boleta de OTRO vendedor en la MISMA rifa: no puede aparecer.
  await nuevaBoleta({
    organization_id: ctx.demoOrg.id,
    raffle_id: raffleId,
    seller_id: ctx.ids.seller2,
    daily: '8888',
    weekly: '8889',
    estado: 'available',
  })

  // Otra organizacion con su propio catalogo publicado.
  const { data: otraRifa } = await svc
    .from('raffles')
    .insert({
      organization_id: ctx.controlOrg.id,
      name: 'Rifa Catalogo Control',
      ticket_price: 50_000,
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      status: 'active',
      created_by: ctx.ids.otherOrgSeller,
    })
    .select('id')
    .maybeSingle()
  otraOrgRaffleId = otraRifa!.id
  await nuevaBoleta({
    organization_id: ctx.controlOrg.id,
    raffle_id: otraOrgRaffleId,
    seller_id: ctx.ids.otherOrgSeller,
    daily: '9999',
    weekly: '9998',
    estado: 'available',
  })

  await db.query(
    `update memberships
        set public_slug = $1, public_catalog_enabled = true,
            public_whatsapp_number = $2, public_raffle_id = $3
      where profile_id = $4 and organization_id = $5`,
    [SLUG, WHATSAPP, raffleId, ctx.ids.seller1, ctx.demoOrg.id],
  )
  await db.query(
    `update memberships
        set public_slug = $1, public_catalog_enabled = true,
            public_whatsapp_number = $2, public_raffle_id = $3
      where profile_id = $4 and organization_id = $5`,
    [OTRO_SLUG, '573009998877', otraOrgRaffleId, ctx.ids.otherOrgSeller, ctx.controlOrg.id],
  )
}, 60_000)

/**
 * Deja la base como estaba: la configuracion publica, las boletas y las dos
 * rifas de esta suite.
 *
 * Va por `pg` y NO por PostgREST: borrar por PostgREST falla en silencio cuando
 * no hay privilegio de DELETE —que aqui no lo hay para nadie— y dejaria la base
 * sucia para la siguiente suite (I-059).
 *
 * Se borra POR NOMBRE de rifa, no por el id que guardo esta ejecucion, para que
 * tambien limpie lo que dejara una ejecucion anterior interrumpida.
 */
async function limpiar() {
  await db.query(
    `update memberships
        set public_slug = null, public_catalog_enabled = false,
            public_whatsapp_number = null, public_raffle_id = null
      where public_slug in ($1, $2)`,
    [SLUG, OTRO_SLUG],
  )

  const { rows } = await db.query<{ id: string }>(
    "select id from raffles where name in ('Rifa Catalogo Publico', 'Rifa Catalogo Control')",
  )
  const rifas = rows.map((row) => row.id)
  if (rifas.length === 0) return

  // Vender una boleta deja rastro en el motor de comision (0024, 0031), y esas
  // dos tablas apuntan a la rifa: sin borrarlas primero, el `delete` de la rifa
  // choca contra `seller_commissions_raffle_org_fk`.
  await db.query('delete from tickets where raffle_id = any($1::uuid[])', [rifas])
  await db.query('delete from commission_ledger where raffle_id = any($1::uuid[])', [rifas])
  await db.query('delete from seller_commissions where raffle_id = any($1::uuid[])', [rifas])
  await db.query('delete from raffles where id = any($1::uuid[])', [rifas])
}

afterAll(async () => {
  await limpiar()
  await db.end()
})

describe('privilegios: el visitante no toca nada (BR-K07)', () => {
  it('anon no puede consultar tickets, memberships, profiles ni raffles por PostgREST', async () => {
    const anon = anonClient()
    for (const tabla of ['tickets', 'memberships', 'profiles', 'raffles', 'clients'] as const) {
      const { data, error } = await anon.from(tabla).select('*').limit(1)
      // Sin politica para `anon` la respuesta es un error de permisos o, en el
      // mejor de los casos, cero filas. Lo que NO puede haber es una fila.
      expect(data ?? [], `${tabla} devolvio filas a anon`).toHaveLength(0)
      if (error) expect(error.code).toBe('42501')
    }
  })

  it('anon no puede ejecutar las funciones del catalogo', async () => {
    const anon = anonClient()
    const meta = await anon.rpc('public_catalog_seller', { p_slug: SLUG })
    expect(meta.error).not.toBeNull()

    const rows = await anon.rpc('public_catalog_tickets', { p_slug: SLUG })
    expect(rows.error).not.toBeNull()
  })

  it('anon no puede ejecutar la funcion interna de resolucion', async () => {
    const anon = anonClient()
    const { error } = await anon.rpc(
      'public_catalog_membership' as 'public_catalog_seller',
      { p_slug: SLUG },
    )
    expect(error).not.toBeNull()
  })

  it('el catalogo del privilegio: solo service_role ejecuta las dos publicas', async () => {
    const { rows } = await db.query(`
      select p.proname,
             has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
             has_function_privilege('service_role', p.oid, 'EXECUTE')  as svc,
             p.prosecdef                                               as definer,
             p.proconfig::text                                         as cfg
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'public\\_catalog%'
       order by p.proname
    `)

    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.anon, `${row.proname} es ejecutable por anon`).toBe(false)
      expect(row.auth, `${row.proname} es ejecutable por authenticated`).toBe(false)
      expect(row.definer, `${row.proname} no es SECURITY DEFINER`).toBe(true)
      expect(row.cfg, `${row.proname} sin search_path fijo`).toContain('search_path=public, pg_temp')
    }
    // La interna no la ejecuta NADIE; las dos publicas, solo el rol servidor.
    const byName = Object.fromEntries(rows.map((r) => [r.proname, r]))
    expect(byName.public_catalog_membership.svc).toBe(false)
    expect(byName.public_catalog_seller.svc).toBe(true)
    expect(byName.public_catalog_tickets.svc).toBe(true)
  })
})

describe('proyeccion publica: lo que sale y lo que no (BR-K08)', () => {
  it('devuelve el vendedor, la rifa, el WhatsApp y los totales, y ni un identificador', async () => {
    const rows = await seller(SLUG)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      seller_name: 'Julian Vargas',
      seller_alias: null,
      whatsapp_number: WHATSAPP,
      raffle_name: 'Rifa Catalogo Publico',
      ticket_price: '120000',
      available_count: String(DISPONIBLES.length),
      taken_count: String(TOMADAS.length),
    })
    // Ninguna columna de la proyeccion es un uuid.
    for (const value of Object.values(rows[0])) {
      expect(String(value)).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i)
    }
  })

  it('cada boleta trae SOLO los dos numeros (D-164)', async () => {
    const rows = await tickets(SLUG)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['daily_number', 'weekly_number'])
    }
  })

  it('no aparece ningun cliente ni ningun dato de pago', async () => {
    const rows = await tickets(SLUG)
    const texto = JSON.stringify(rows)
    expect(texto).not.toContain('Ana Torres')
    expect(texto).not.toContain('120000')
    expect(texto).not.toContain(ctx.clients.ana.id)
  })

  it('SOLO salen las disponibles: una boleta tomada no viaja (D-164)', async () => {
    const rows = await tickets(SLUG, { limit: 61 })
    const numeros = rows.map((r) => r.daily_number)

    expect([...numeros].sort()).toEqual([...DISPONIBLES].sort())
    for (const tomada of TOMADAS) {
      expect(numeros, `la boleta tomada ${tomada} salio al catalogo`).not.toContain(tomada)
    }
  })

  it('las tomadas siguen contando en los totales, aunque no se publiquen', async () => {
    const [meta] = await seller(SLUG)
    expect(meta.available_count).toBe(String(DISPONIBLES.length))
    expect(meta.taken_count).toBe(String(TOMADAS.length))
    // Los estados que no son del catalogo tampoco entran en sus cifras.
    expect(Number(meta.available_count) + Number(meta.taken_count)).toBe(
      DISPONIBLES.length + TOMADAS.length,
    )
  })

  it('los totales no dependen de la pagina ni de la busqueda', async () => {
    // La funcion de metadatos NO recibe ninguna de las dos cosas, asi que esto
    // no puede fallar por construccion; se comprueba igual porque es la promesa
    // que sostiene la franja de cifras (BR-K14).
    const primera = (await seller(SLUG))[0]
    await tickets(SLUG, { limit: 1, offset: 4 })
    await tickets(SLUG, { search: '0100' })
    const despues = (await seller(SLUG))[0]

    expect(despues.available_count).toBe(primera.available_count)
    expect(despues.taken_count).toBe(primera.taken_count)
  })

  it('un vendedor no recibe los totales de otro', async () => {
    const propios = (await seller(SLUG))[0]
    const ajenos = (await seller(OTRO_SLUG))[0]

    // La otra organizacion publica UNA boleta disponible y ninguna tomada.
    expect(ajenos.available_count).toBe('1')
    expect(ajenos.taken_count).toBe('0')
    expect(ajenos.available_count).not.toBe(propios.available_count)
  })

  it('draft, pending_approval y cancelled no aparecen de ninguna forma', async () => {
    const rows = await tickets(SLUG, { limit: 61 })
    const numeros = rows.map((r) => r.daily_number)
    for (const oculta of OCULTAS) {
      expect(numeros, `${oculta.estado} se filtro al catalogo`).not.toContain(oculta.daily)
    }
  })

  it('las boletas de otro vendedor de la misma rifa no aparecen', async () => {
    const numeros = (await tickets(SLUG, { limit: 61 })).map((r) => r.daily_number)
    expect(numeros).not.toContain('8888')
  })

  it('un slug no deja saltar a otra organizacion', async () => {
    const propias = (await tickets(SLUG, { limit: 61 })).map((r) => r.daily_number)
    expect(propias).not.toContain('9999')

    const otras = await tickets(OTRO_SLUG, { limit: 61 })
    expect(otras.map((r) => r.daily_number)).toEqual(['9999'])
    expect((await seller(OTRO_SLUG))[0].raffle_name).toBe('Rifa Catalogo Control')
  })

  it('conserva los ceros iniciales (BR-N03)', async () => {
    const numeros = (await tickets(SLUG)).map((r) => r.daily_number)
    expect(numeros).toContain('0007')
    expect(numeros).toContain('0025')
    expect(numeros).not.toContain('7')
    expect(numeros).not.toContain('25')
  })

  it('el orden es numerico, no alfabetico', async () => {
    const numeros = (await tickets(SLUG, { limit: 61 })).map((r) => r.daily_number)
    // Alfabeticamente «1300» iria antes que «0025»; numericamente, al final.
    // Las tomadas —0009 y 1234— ya no aparecen entre medias (D-164).
    expect(numeros).toEqual(['0007', '0025', '0100', '0101', '1300'])
  })
})

describe('quien no publica (BR-K10)', () => {
  /** Aplica un cambio, mira el catalogo y deja la base como estaba. */
  async function conCambio(sql: string, params: unknown[], deshacer: string) {
    await db.query(sql, params)
    try {
      return { meta: await seller(SLUG), rows: await tickets(SLUG) }
    } finally {
      await db.query(deshacer, params)
    }
  }

  it('un catalogo apagado no publica', async () => {
    const r = await conCambio(
      'update memberships set public_catalog_enabled = false where public_slug = $1',
      [SLUG],
      'update memberships set public_catalog_enabled = true where public_slug = $1',
    )
    expect(r.meta).toHaveLength(0)
    expect(r.rows).toHaveLength(0)
  })

  it('un vendedor con la membresia inactiva no publica', async () => {
    const r = await conCambio(
      'update memberships set is_active = false where public_slug = $1',
      [SLUG],
      'update memberships set is_active = true where public_slug = $1',
    )
    expect(r.meta).toHaveLength(0)
    expect(r.rows).toHaveLength(0)
  })

  it('un vendedor con el perfil inactivo no publica', async () => {
    const r = await conCambio(
      'update profiles set is_active = false where id = $1',
      [ctx.ids.seller1],
      'update profiles set is_active = true where id = $1',
    )
    expect(r.meta).toHaveLength(0)
    expect(r.rows).toHaveLength(0)
  })

  it('una organizacion inactiva no publica', async () => {
    const r = await conCambio(
      'update organizations set is_active = false where id = $1',
      [ctx.demoOrg.id],
      'update organizations set is_active = true where id = $1',
    )
    expect(r.meta).toHaveLength(0)
    expect(r.rows).toHaveLength(0)
  })

  it('una rifa cerrada no publica', async () => {
    const r = await conCambio(
      "update raffles set status = 'closed' where id = $1",
      [raffleId],
      "update raffles set status = 'active' where id = $1",
    )
    expect(r.meta).toHaveLength(0)
    expect(r.rows).toHaveLength(0)
  })

  it('un slug inexistente no dice nada', async () => {
    expect(await seller('no-existe-en-ningun-sitio')).toHaveLength(0)
    expect(await tickets('no-existe-en-ningun-sitio')).toHaveLength(0)
  })

  it('un administrador no puede publicarse: la funcion exige rol vendedor', async () => {
    await db.query(
      `update memberships set public_slug = 'admin-intruso-k7m4',
              public_catalog_enabled = true, public_whatsapp_number = $1,
              public_raffle_id = $2
        where profile_id = $3`,
      [WHATSAPP, raffleId, ctx.ids.admin],
    )
    try {
      expect(await seller('admin-intruso-k7m4')).toHaveLength(0)
      expect(await tickets('admin-intruso-k7m4')).toHaveLength(0)
    } finally {
      await db.query(
        `update memberships set public_slug = null, public_catalog_enabled = false,
                public_whatsapp_number = null, public_raffle_id = null
          where profile_id = $1`,
        [ctx.ids.admin],
      )
    }
  })
})

describe('el slug (BR-K02, BR-K03)', () => {
  it('es unico en todo el sistema, no por organizacion', async () => {
    await expect(
      db.query('update memberships set public_slug = $1 where profile_id = $2', [
        SLUG,
        ctx.ids.seller2,
      ]),
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('rechaza mayusculas, espacios, tildes y guiones sueltos', async () => {
    for (const malo of ['MAYUSCULAS', 'con espacio', 'con-tilde-ñ', '-empieza-mal', 'termina-', 'ab']) {
      await expect(
        db.query('update memberships set public_slug = $1 where profile_id = $2', [
          malo,
          ctx.ids.seller2,
        ]),
        `acepto el slug invalido «${malo}»`,
      ).rejects.toMatchObject({ code: '23514' })
    }
  })

  it('publicar exige enlace, WhatsApp y rifa', async () => {
    await expect(
      db.query(
        `update memberships set public_catalog_enabled = true
          where profile_id = $1 and organization_id = $2`,
        [ctx.ids.seller2, ctx.demoOrg.id],
      ),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('el WhatsApp solo admite digitos en formato internacional', async () => {
    for (const malo of ['+573001234567', '300 123 4567', '0573001234567', '123']) {
      await expect(
        db.query('update memberships set public_whatsapp_number = $1 where profile_id = $2', [
          malo,
          ctx.ids.seller2,
        ]),
        `acepto el WhatsApp invalido «${malo}»`,
      ).rejects.toMatchObject({ code: '23514' })
    }
  })

  it('la rifa publicada tiene que ser de la misma organizacion', async () => {
    await expect(
      db.query(
        `update memberships set public_raffle_id = $1
          where profile_id = $2 and organization_id = $3`,
        [otraOrgRaffleId, ctx.ids.seller1, ctx.demoOrg.id],
      ),
    ).rejects.toMatchObject({ code: '23503' })
  })
})

describe('paginacion y limites (BR-K11)', () => {
  it('el tope de pagina no se puede evadir', async () => {
    const rows = await tickets(SLUG, { limit: 100_000 })
    expect(rows.length).toBeLessThanOrEqual(61)

    const negativo = await tickets(SLUG, { limit: -5 })
    expect(negativo.length).toBeGreaterThanOrEqual(1)

    const cero = await tickets(SLUG, { limit: 0 })
    expect(cero.length).toBeGreaterThanOrEqual(1)
  })

  it('un desplazamiento negativo se trata como cero', async () => {
    const desde0 = await tickets(SLUG, { offset: 0 })
    const negativo = await tickets(SLUG, { offset: -10 })
    expect(negativo).toEqual(desde0)
  })

  it('la paginacion es estable: ni repite ni se salta boletas', async () => {
    const todas = await tickets(SLUG, { limit: 61 })
    const porPaginas: PublicTicket[] = []
    for (let offset = 0; offset < todas.length; offset += 2) {
      porPaginas.push(...(await tickets(SLUG, { limit: 2, offset })))
    }
    expect(porPaginas).toEqual(todas)
  })

  it('pedir una pagina mas alla del final devuelve vacio, no un error', async () => {
    expect(await tickets(SLUG, { limit: 50, offset: 500 })).toEqual([])
  })

  it('la paginacion se calcula sobre las DISPONIBLES: las tomadas no ocupan sitio (D-164)', async () => {
    // El filtro va antes de `limit`/`offset`. Si se aplicara despues, una
    // pagina de 2 traeria menos de 2 tarjetas cada vez que le tocara una
    // tomada, y el final llegaria antes de tiempo.
    const todas = await tickets(SLUG, { limit: 61 })
    expect(todas).toHaveLength(DISPONIBLES.length)

    const primera = await tickets(SLUG, { limit: 2, offset: 0 })
    const segunda = await tickets(SLUG, { limit: 2, offset: 2 })
    expect(primera).toHaveLength(2)
    expect(segunda).toHaveLength(2)
    expect(primera.map((r) => r.daily_number)).not.toEqual(segunda.map((r) => r.daily_number))

    // Y el ultimo desplazamiento util es el de las disponibles, no el de todo
    // el inventario publicable de antes.
    expect(await tickets(SLUG, { limit: 2, offset: DISPONIBLES.length })).toEqual([])
  })
})

describe('busqueda publica (BR-K08)', () => {
  it('encuentra por el numero diario, entero y en parte', async () => {
    expect((await tickets(SLUG, { search: '0100' })).map((r) => r.daily_number)).toEqual(['0100'])
    expect((await tickets(SLUG, { search: '010' })).map((r) => r.daily_number)).toEqual([
      '0100',
      '0101',
    ])
  })

  it('encuentra tambien por el numero semanal', async () => {
    const rows = await tickets(SLUG, { search: '5002' })
    expect(rows.map((r) => r.weekly_number)).toEqual(['5002'])
  })

  it('buscar una boleta TOMADA no devuelve nada, ni por su diario ni por su semanal (D-164)', async () => {
    for (const tomada of TOMADAS) {
      expect(await tickets(SLUG, { search: tomada })).toEqual([])
    }
    // 6000 y 6001 son los semanales de las dos tomadas.
    expect(await tickets(SLUG, { search: '6000' })).toEqual([])
    expect(await tickets(SLUG, { search: '6001' })).toEqual([])
  })

  it('respeta los ceros iniciales: «7» no encuentra «0007» por igualdad numerica', async () => {
    const rows = await tickets(SLUG, { search: '0007' })
    expect(rows.map((r) => r.daily_number)).toEqual(['0007'])
  })

  it('un termino que no puede ser un numero de boleta no devuelve nada', async () => {
    expect(await tickets(SLUG, { search: '12345' })).toEqual([])
    expect(await tickets(SLUG, { search: 'abc' })).toEqual([])
    expect(await tickets(SLUG, { search: "'; drop table tickets; --" })).toEqual([])
  })

  it('la busqueda no se salta los filtros de estado ni de vendedor', async () => {
    // 8888 es de otro vendedor y 4001 es un borrador: ninguno aparece aunque
    // se busque su numero exacto.
    expect(await tickets(SLUG, { search: '8888' })).toEqual([])
    expect(await tickets(SLUG, { search: '4001' })).toEqual([])
  })
})
