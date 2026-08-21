/**
 * El MISMO buscador de boletas encuentra por el nombre del cliente
 * (migracion 0029, BR-N13, D-100).
 *
 * Sigue siendo la busqueda de BOLETAS: escribir «Ana» devuelve las boletas de
 * Ana, no una ficha de Ana. Lo que cambia es por donde se llega a ellas.
 *
 * `ticket-search.test.ts` cubre la busqueda por numero y no se toca: esa rama
 * quedo identica a proposito, y sus pruebas son la red que lo demuestra.
 *
 * Dos capas, dos formas de probar (igual que en aquel archivo):
 *
 *   * El ORDEN y las COINCIDENCIAS, con `pg` dentro de una transaccion que se
 *     revierte. Hacen falta nombres y numeros concretos, y ni los clientes ni
 *     las boletas se pueden borrar despues (no hay DELETE en ninguna tabla,
 *     D-038). Esa conexion es superusuario y por tanto NO prueba RLS.
 *   * El AISLAMIENTO, con sesiones reales de `supabase-js` y clave publica
 *     (docs/TESTING.md 2). Es el punto que no puede fallar: ampliar POR DONDE
 *     se busca no puede ampliar QUE se puede ver.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  DB_URL,
  USERS,
  anonClient,
  loadSeedContext,
  serviceClient,
  signInAs,
  type Client,
} from './helpers'

let db: PgClient

beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
})

afterAll(async () => {
  await db.end()
})

type NameRow = {
  id: string
  client_id: string | null
  client_name: string | null
  daily_number: string | null
  weekly_number: string | null
  total_count: string
}

/**
 * Crea clientes con sus boletas vendidas, busca, y lo deshace todo.
 *
 * Cada entrada es `[nombre del cliente, numero diario, numero semanal]`. Los
 * clientes se crean una vez por nombre distinto, de modo que repetir un nombre
 * en la lista da varias boletas del MISMO cliente —que es justo el caso que
 * mas importa—. Para tener DOS personas llamadas igual esta `duplicarNombre`.
 *
 * Devuelve SOLO las filas creadas aqui: el seed tiene sus propios clientes y
 * colarlos haria que la prueba dependiera del seed en vez del orden, que es lo
 * que se mide.
 */
async function searchByName(
  filas: readonly (readonly [string, string, string])[],
  term: string,
  options: { duplicarNombre?: string } = {},
): Promise<NameRow[]> {
  await db.query('begin')
  try {
    const clientIds = new Map<string, string>()
    for (const [nombre] of filas) {
      if (clientIds.has(nombre)) continue
      const { rows } = await db.query<{ id: string }>(
        `insert into clients (organization_id, seller_id, name, phone)
         select organization_id, seller_id, $1, '3009990000'
         from clients where name = 'Ana Torres' limit 1
         returning id`,
        [nombre],
      )
      clientIds.set(nombre, rows[0]!.id)
    }

    // Una segunda persona con el MISMO nombre: sus boletas tienen que salir
    // igual, sin mezclarse con las de la primera. El nombre no identifica.
    let gemeloId: string | undefined
    if (options.duplicarNombre !== undefined) {
      const { rows } = await db.query<{ id: string }>(
        `insert into clients (organization_id, seller_id, name, phone)
         select organization_id, seller_id, $1, '3008880000'
         from clients where name = 'Ana Torres' limit 1
         returning id`,
        [options.duplicarNombre],
      )
      gemeloId = rows[0]!.id
    }

    const venderA = (clientId: string, daily: string, weekly: string) =>
      db.query(
        `insert into tickets (organization_id, raffle_id, seller_id, created_by, client_id,
                              daily_number, weekly_number, inventory_status,
                              sale_price, assigned_at, sale_date)
         select organization_id, raffle_id, seller_id, created_by, $3, $1, $2, 'assigned',
                120000, now(), current_date
         from tickets where daily_number = '0100' limit 1`,
        [daily, weekly, clientId],
      )

    for (const [nombre, daily, weekly] of filas) {
      await venderA(clientIds.get(nombre)!, daily, weekly)
    }
    if (gemeloId !== undefined) await venderA(gemeloId, '8801', '8802')

    const creados = new Set([...clientIds.values(), ...(gemeloId ? [gemeloId] : [])])
    const { rows } = await db.query<NameRow>(
      `select id, client_id, client_name, daily_number, weekly_number, total_count
       from search_tickets($1, p_limit => 500)`,
      [term],
    )
    return rows.filter((row) => row.client_id !== null && creados.has(row.client_id))
  } finally {
    await db.query('rollback')
  }
}

const conCliente = (rows: NameRow[]) =>
  rows.map((row) => `${row.client_name}: ${row.daily_number}/${row.weekly_number}`)

describe('search_tickets: encuentra por el nombre del cliente (BR-N13)', () => {
  it('el nombre completo devuelve las boletas de esa persona', async () => {
    const rows = await searchByName([['Jimmy Riveros', '5682', '5532']], 'Jimmy Riveros')
    expect(conCliente(rows)).toEqual(['Jimmy Riveros: 5682/5532'])
  })

  it('solo el primer nombre basta', async () => {
    const rows = await searchByName([['Jimmy Riveros', '5682', '5532']], 'Jimmy')
    expect(conCliente(rows)).toEqual(['Jimmy Riveros: 5682/5532'])
  })

  it('solo el apellido basta', async () => {
    const rows = await searchByName([['Jimmy Riveros', '5682', '5532']], 'Riveros')
    expect(conCliente(rows)).toEqual(['Jimmy Riveros: 5682/5532'])
  })

  it('parte del nombre basta', async () => {
    const rows = await searchByName([['Jimmy Riveros', '5682', '5532']], 'Rive')
    expect(conCliente(rows)).toEqual(['Jimmy Riveros: 5682/5532'])
  })

  it('sin tildes y en minusculas encuentra igual, como en «Clientes»', async () => {
    const rows = await searchByName([['Jesús Peña', '5683', '5533']], 'jesus pena')
    expect(conCliente(rows)).toEqual(['Jesús Peña: 5683/5533'])
  })

  it('un cliente con varias boletas devuelve TODAS, no una ficha suya', async () => {
    const rows = await searchByName(
      [
        ['Carlos Martinez', '1257', '5534'],
        ['Carlos Martinez', '5684', '9012'],
        ['Carlos Martinez', '8340', '2210'],
      ],
      'Carlos Martinez',
    )

    expect(conCliente(rows)).toEqual([
      'Carlos Martinez: 1257/5534',
      'Carlos Martinez: 5684/9012',
      'Carlos Martinez: 8340/2210',
    ])
    // Cada resultado es una boleta distinta, con su propio id: al tocarla se
    // abre ESA boleta, no un resumen del cliente.
    expect(new Set(rows.map((row) => row.id)).size).toBe(3)
  })

  it('dos clientes con el mismo nombre: salen las boletas de los dos', async () => {
    const rows = await searchByName([['Carlos Martinez', '1257', '5534']], 'Carlos Martinez', {
      duplicarNombre: 'Carlos Martinez',
    })

    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.client_name))).toEqual(new Set(['Carlos Martinez']))
    // Mismo nombre en pantalla, dos personas distintas por dentro.
    expect(new Set(rows.map((row) => row.client_id)).size).toBe(2)
  })

  it('una boleta sin cliente no aparece por nombre, y por su numero si', async () => {
    const { rows: sinCliente } = await db.query<{ id: string }>(
      `select id from tickets where daily_number = '0100' and client_id is null`,
    )
    expect(sinCliente.length).toBeGreaterThan(0)

    const porNombre = await db.query<{ id: string }>(
      'select id from search_tickets($1, p_limit => 500)',
      ['Ana'],
    )
    for (const boleta of sinCliente) {
      expect(porNombre.rows.map((row) => row.id)).not.toContain(boleta.id)
    }

    const porNumero = await db.query<{ id: string }>('select id from search_tickets($1)', ['0100'])
    expect(porNumero.rows.map((row) => row.id)).toEqual(
      expect.arrayContaining(sinCliente.map((row) => row.id)),
    )
  })

  it('un nombre que no existe devuelve cero filas, no un error', async () => {
    const { rows } = await db.query('select * from search_tickets($1)', ['Zzyzx Inexistente'])
    expect(rows).toHaveLength(0)
  })

  it('una sola letra no busca: devolveria media tabla sin ayudar a nadie', async () => {
    const { rows } = await db.query('select * from search_tickets($1)', ['a'])
    expect(rows).toHaveLength(0)
  })

  it('los comodines de `like` se escriben, no se ejecutan', async () => {
    // Sin quitarlos, «%» significaria «lo que sea» y traeria a todo el mundo.
    const { rows: comodin } = await db.query('select * from search_tickets($1)', ['%%'])
    expect(comodin).toHaveLength(0)

    // «Ji%my» se busca como «Jimy», que no esta dentro de ningun nombre.
    const conComodin = await searchByName([['Jimmy Riveros', '5682', '5532']], 'Ji%my')
    expect(conComodin).toHaveLength(0)
  })
})

describe('search_tickets: orden por relevancia del nombre (BR-N13)', () => {
  it('el nombre exacto va primero, luego el que empieza, luego el resto', async () => {
    const rows = await searchByName(
      [
        ['Mariana Prado', '6001', '7001'], // «ana» esta DENTRO de una palabra
        ['Rosa Ana Quintero', '6002', '7002'], // una palabra suya EMPIEZA por «ana»
        ['Ana Belen Suarez', '6003', '7003'], // el nombre EMPIEZA por «ana»
        ['Ana', '6004', '7004'], // el nombre completo ES «ana»
      ],
      'Ana',
    )

    expect(conCliente(rows)).toEqual([
      'Ana: 6004/7004',
      'Ana Belen Suarez: 6003/7003',
      'Rosa Ana Quintero: 6002/7002',
      'Mariana Prado: 6001/7001',
    ])
  })

  it('las boletas de un mismo cliente salen juntas y ordenadas por su numero', async () => {
    const rows = await searchByName(
      [
        ['Zulma Perez', '6205', '7205'],
        ['Yolanda Perez', '6201', '7201'],
        ['Zulma Perez', '6203', '7203'],
        ['Yolanda Perez', '6202', '7202'],
      ],
      'Perez',
    )

    // Los dos clientes empatan en relevancia —ninguno empieza por «perez», los
    // dos tienen una palabra que si—, asi que manda el orden alfabetico; y
    // dentro de cada persona, el numero.
    expect(conCliente(rows)).toEqual([
      'Yolanda Perez: 6201/7201',
      'Yolanda Perez: 6202/7202',
      'Zulma Perez: 6203/7203',
      'Zulma Perez: 6205/7205',
    ])
  })

  it('`total_count` es el total de la busqueda, no el de la pagina', async () => {
    await db.query('begin')
    try {
      const { rows: cliente } = await db.query<{ id: string }>(
        `insert into clients (organization_id, seller_id, name, phone)
         select organization_id, seller_id, 'Wanda Paginada', '3007770000'
         from clients where name = 'Ana Torres' limit 1
         returning id`,
      )
      for (const [daily, weekly] of [
        ['6301', '7301'],
        ['6302', '7302'],
        ['6303', '7303'],
      ] as const) {
        await db.query(
          `insert into tickets (organization_id, raffle_id, seller_id, created_by, client_id,
                                daily_number, weekly_number, inventory_status,
                                sale_price, assigned_at, sale_date)
           select organization_id, raffle_id, seller_id, created_by, $3, $1, $2, 'assigned',
                  120000, now(), current_date
           from tickets where daily_number = '0100' limit 1`,
          [daily, weekly, cliente[0]!.id],
        )
      }

      const buscar = (limit: number, offset: number) =>
        db.query<{ daily_number: string; total_count: string }>(
          'select daily_number, total_count from search_tickets($1, p_limit => $2, p_offset => $3)',
          ['Wanda Paginada', limit, offset],
        )

      const { rows: page1 } = await buscar(2, 0)
      const { rows: page2 } = await buscar(2, 2)

      expect(Number(page1[0]!.total_count)).toBe(3)
      expect(Number(page2[0]!.total_count)).toBe(3)
      // La paginacion no repite ni se salta filas.
      expect(page1.map((row) => row.daily_number)).toEqual(['6301', '6302'])
      expect(page2.map((row) => row.daily_number)).toEqual(['6303'])
    } finally {
      await db.query('rollback')
    }
  })
})

describe('search_tickets: la busqueda por numero NO cambio (regresion de 0018)', () => {
  it('de 1 a 4 cifras sigue yendo por los numeros, nunca por el cliente', async () => {
    // El cliente que se crea aqui tiene «1234» en su nombre. Si el termino
    // numerico se colara por la rama de nombre, sus boletas apareceriaan.
    const rows = await searchByName([['Cliente 1234 Prueba', '9101', '9102']], '1234')
    expect(rows).toHaveLength(0)
  })

  it('el codigo interno sigue sin servir para buscar, tampoco como texto', async () => {
    const { rows: existentes } = await db.query<{ internal_code: string }>(
      'select internal_code from tickets limit 1',
    )
    const { rows } = await db.query('select * from search_tickets($1)', [
      existentes[0]!.internal_code,
    ])
    expect(rows).toHaveLength(0)
  })
})

/**
 * El punto que no puede fallar: ampliar POR DONDE se busca no amplia QUE se
 * puede ver. La funcion sigue siendo `security invoker`, asi que lee `tickets`
 * bajo `tickets_select` y `clients` bajo `clients_select`, que son simetricas.
 *
 * Los tres clientes se llaman IGUAL a proposito: si la herencia se rompiera, un
 * vendedor encontraria por ese nombre las boletas de los otros dos.
 */
describe('search_tickets por nombre: hereda la RLS de quien busca', () => {
  let seller1: Client
  let seller2: Client
  let demoOwner: Client
  let controlOwner: Client

  /** Apellido comun a los tres clientes creados aqui: es lo que se busca. */
  const apellido = `Zeta${Math.floor(Math.random() * 100000)}`
  const clientesCreados: string[] = []
  const boletasCreadas: string[] = []
  let deSeller1 = ''
  let deSeller2 = ''
  let deOtraOrg = ''

  beforeAll(async () => {
    const seed = await loadSeedContext()
    ;[seller1, seller2, demoOwner, controlOwner] = await Promise.all([
      signInAs(USERS.seller1),
      signInAs(USERS.seller2),
      signInAs(USERS.owner),
      signInAs(USERS.otherOrgOwner),
    ])

    const numero = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0')

    const crear = async (organizationId: string, raffleId: string, sellerId: string) => {
      const { data: cliente, error: clienteError } = await seed.svc
        .from('clients')
        .insert({
          organization_id: organizationId,
          seller_id: sellerId,
          name: `Nombre ${apellido}`,
          phone: '3006660000',
        })
        .select('id')
        .single()
      if (clienteError) throw clienteError
      clientesCreados.push(cliente.id)

      const { data: boleta, error: boletaError } = await seed.svc
        .from('tickets')
        .insert({
          organization_id: organizationId,
          raffle_id: raffleId,
          seller_id: sellerId,
          created_by: sellerId,
          client_id: cliente.id,
          daily_number: numero(),
          weekly_number: numero(),
          inventory_status: 'assigned',
          sale_price: 120000,
          assigned_at: new Date().toISOString(),
          sale_date: new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single()
      if (boletaError) throw boletaError
      boletasCreadas.push(boleta.id)
      return boleta.id
    }

    deSeller1 = await crear(seed.demoOrg.id, seed.demoRaffle.id, seed.ids.seller1)
    deSeller2 = await crear(seed.demoOrg.id, seed.demoRaffle.id, seed.ids.seller2)
    deOtraOrg = await crear(seed.controlOrg.id, seed.controlRaffle.id, seed.ids.otherOrgSeller)
  })

  afterAll(async () => {
    const svc = serviceClient()
    if (boletasCreadas.length > 0) await svc.from('tickets').delete().in('id', boletasCreadas)
    if (clientesCreados.length > 0) await svc.from('clients').delete().in('id', clientesCreados)
  })

  const ids = (data: { id: string }[] | null) => (data ?? []).map((row) => row.id)

  it('un vendedor NO encuentra por nombre la boleta de otro vendedor', async () => {
    const propia = await seller2.rpc('search_tickets', { p_search: apellido })
    const ajena = await seller1.rpc('search_tickets', { p_search: apellido })

    expect(propia.error).toBeNull()
    expect(ids(propia.data)).toContain(deSeller2)
    expect(ajena.error).toBeNull()
    // El cliente del otro vendedor se llama IGUAL y aun asi no aparece: buscar
    // por un camino distinto no abre una puerta distinta.
    expect(ids(ajena.data)).not.toContain(deSeller2)
    expect(ids(ajena.data)).toContain(deSeller1)
  })

  it('el personal si encuentra por nombre las boletas de cualquier vendedor suyo', async () => {
    const { data, error } = await demoOwner.rpc('search_tickets', { p_search: apellido })
    expect(error).toBeNull()
    expect(ids(data)).toEqual(expect.arrayContaining([deSeller1, deSeller2]))
  })

  it('un nombre repetido en otra organizacion no se cruza', async () => {
    const demo = await demoOwner.rpc('search_tickets', { p_search: apellido })
    const control = await controlOwner.rpc('search_tickets', { p_search: apellido })

    expect(ids(demo.data)).not.toContain(deOtraOrg)
    expect(ids(control.data)).toContain(deOtraOrg)
    expect(ids(control.data)).not.toContain(deSeller1)
  })

  it('los filtros acotan sin abrir nada: pedir otro vendedor no lo revela', async () => {
    const { data, error } = await seller1.rpc('search_tickets', {
      p_search: apellido,
      p_seller_id: (await seller2.auth.getUser()).data.user!.id,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('un visitante anonimo no puede ejecutar la busqueda', async () => {
    const { error } = await anonClient().rpc('search_tickets', { p_search: apellido })
    expect(error).not.toBeNull()
  })
})
