/**
 * Busqueda de boletas por sus numeros (migracion 0018, BR-N11, D-080).
 *
 * La regla que se comprueba aqui es de negocio, no de presentacion: para quien
 * usa el sistema una boleta se busca por su NUMERO DIARIO y, en segundo lugar,
 * por su NUMERO SEMANAL. El codigo interno dejo de participar en la busqueda.
 *
 * Dos capas, dos formas de probar:
 *
 *   * El ORDEN y las COINCIDENCIAS se prueban con `pg` dentro de una
 *     transaccion que se revierte. Hace falta insertar combinaciones concretas
 *     —exacta, por comienzo, por contenido, en cada uno de los dos numeros— y
 *     esas combinaciones no se pueden borrar despues (no hay DELETE en ninguna
 *     tabla, D-038): la transaccion es la unica forma de no dejar basura. Esa
 *     conexion es superusuario y por tanto NO prueba RLS.
 *   * El AISLAMIENTO se prueba con sesiones reales de `supabase-js` sobre los
 *     datos del seed, que es como se prueba todo lo demas en este proyecto
 *     (docs/TESTING.md 2). La funcion es `security invoker`: si esa herencia se
 *     rompiera, un vendedor encontraria boletas ajenas por su numero.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DB_URL, USERS, loadSeedContext, serviceClient, signInAs, type Client } from './helpers'

let db: PgClient

beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
})

afterAll(async () => {
  await db.end()
})

type SearchRow = {
  daily_number: string | null
  weekly_number: string | null
  total_count: string
}

/**
 * Crea las boletas indicadas, busca, y lo deshace todo.
 *
 * Las combinaciones son fijas a proposito: sin numeros conocidos no se puede
 * afirmar nada sobre el orden. Al revertir, la siguiente ejecucion encuentra la
 * base igual que la dejo el seed.
 *
 * Devuelve SOLO las filas insertadas aqui, en el orden en que las devolvio la
 * funcion. El seed tiene sus propias boletas y algunas coinciden con estos
 * terminos —«1234/5678» esta ahi a proposito—: colarlas en la comparacion haria
 * que la prueba dependiera del seed en vez del orden, que es lo que se mide.
 */
async function searchOver(combos: readonly [string, string][], term: string): Promise<SearchRow[]> {
  await db.query('begin')
  try {
    for (const [daily, weekly] of combos) {
      await db.query(
        `insert into tickets (organization_id, raffle_id, seller_id, created_by,
                              daily_number, weekly_number, inventory_status)
         select organization_id, raffle_id, seller_id, created_by, $1, $2, 'available'
         from tickets
         where daily_number = '0100'
         limit 1`,
        [daily, weekly],
      )
    }
    const { rows } = await db.query<SearchRow>(
      `select daily_number, weekly_number, total_count
       from search_tickets($1, p_raffle_id => (select raffle_id from tickets where daily_number = '0100' limit 1),
                           p_limit => 500)`,
      [term],
    )
    const propias = new Set(combos.map(([daily, weekly]) => `${daily}/${weekly}`))
    return rows.filter((row) => propias.has(`${row.daily_number}/${row.weekly_number}`))
  } finally {
    await db.query('rollback')
  }
}

const pairs = (rows: SearchRow[]) => rows.map((row) => `${row.daily_number}/${row.weekly_number}`)

describe('search_tickets: que encuentra', () => {
  it('CASO 1 — el numero diario completo encuentra la boleta', async () => {
    const rows = await searchOver([['1111', '2222']], '1111')
    expect(pairs(rows)).toContain('1111/2222')
  })

  it('CASO 2 — parte del numero diario tambien la encuentra', async () => {
    const rows = await searchOver([['1111', '2222']], '111')
    expect(pairs(rows)).toContain('1111/2222')
  })

  it('CASO 3 — el numero semanal completo encuentra la boleta', async () => {
    const rows = await searchOver([['1111', '2222']], '2222')
    expect(pairs(rows)).toContain('1111/2222')
  })

  it('CASO 4 — parte del numero semanal tambien la encuentra', async () => {
    const rows = await searchOver([['1111', '2222']], '222')
    expect(pairs(rows)).toContain('1111/2222')
  })

  it('CASO 7 — los ceros de delante se conservan: «00» encuentra «0017»', async () => {
    const rows = await searchOver([['0017', '8811']], '00')
    expect(pairs(rows)).toContain('0017/8811')
  })

  it('un numero de una sola cifra se busca igual que uno de cuatro', async () => {
    const rows = await searchOver([['7', '1234']], '7')
    expect(pairs(rows)).toContain('7/1234')
  })
})

/**
 * El codigo interno se retiro de la busqueda en 0018 y sigue fuera en 0029
 * (BR-N11).
 *
 * Lo que cambio al escribirse 0029 es COMO se comprueba. Antes bastaba con
 * «este termino no devuelve nada», porque un texto no podia encontrar nada;
 * ahora el mismo campo busca tambien por el cliente (BR-N13), asi que un
 * termino puede no llevar a una boleta por su codigo y aun asi traer otras por
 * su cliente. La regla que importa se afirma directamente: escribir el codigo
 * de una boleta NO lleva a esa boleta.
 */
describe('search_tickets: el codigo interno no lleva a su boleta (BR-N11)', () => {
  /** Busca un recorte del codigo de una boleta real y devuelve que salio. */
  async function buscarPorCodigo(recorte: (code: string) => string) {
    const { rows: boletas } = await db.query<{ id: string; internal_code: string }>(
      'select id, internal_code from tickets order by internal_code limit 1',
    )
    const boleta = boletas[0]!
    const { rows } = await db.query<{ id: string }>(
      'select id from search_tickets($1, p_limit => 500)',
      [recorte(boleta.internal_code)],
    )
    return { boleta, encontrados: rows.map((row) => row.id) }
  }

  it('CASO 5 — el prefijo de un codigo interno no lleva a su boleta', async () => {
    const { boleta, encontrados } = await buscarPorCodigo((code) => code.split('-')[0]!)
    expect(encontrados).not.toContain(boleta.id)
  })

  it('el consecutivo de un codigo interno no lleva a su boleta', async () => {
    const { boleta, encontrados } = await buscarPorCodigo((code) => code.split('-')[1]!)
    expect(encontrados).not.toContain(boleta.id)
  })

  it('un codigo interno completo no lleva a su boleta', async () => {
    const { boleta, encontrados } = await buscarPorCodigo((code) => code)
    expect(encontrados).not.toContain(boleta.id)
  })

  it('un termino vacio no devuelve nada: buscar «todo» no es buscar', async () => {
    const { rows } = await db.query('select * from search_tickets($1)', [''])
    expect(rows).toHaveLength(0)
  })

  /**
   * Un termino que no es un numero de boleta (BR-N02) no puede buscarse como
   * si lo fuera. Desde 0029 pasa por texto, y por texto solo se llega a una
   * boleta A TRAVES de su cliente: si algo sale, tiene cliente.
   */
  for (const termino of ['12A4', '12345', '-123']) {
    it(`«${termino}» no se interpreta como un numero de boleta`, async () => {
      const { rows } = await db.query<{ client_id: string | null }>(
        'select client_id from search_tickets($1, p_limit => 500)',
        [termino],
      )
      for (const row of rows) expect(row.client_id).not.toBeNull()
    })
  }
})

describe('search_tickets: orden por relevancia (BR-N11)', () => {
  /**
   * CASO 6 del encargo, ampliado a los seis escalones. El numero diario manda
   * sobre el semanal, y dentro de cada uno: exacto, luego por comienzo, luego
   * por contenido.
   */
  it('el diario va antes que el semanal, y lo exacto antes que lo parcial', async () => {
    const rows = await searchOver(
      [
        ['9123', '7001'], // diario: contiene
        ['1239', '7002'], // diario: empieza
        ['123', '7003'], // diario: exacto
        ['7004', '9123'], // semanal: contiene
        ['7005', '1239'], // semanal: empieza
        ['7006', '123'], // semanal: exacto
      ],
      '123',
    )

    expect(pairs(rows)).toEqual([
      '123/7003',
      '1239/7002',
      '9123/7001',
      '7006/123',
      '7005/1239',
      '7004/9123',
    ])
  })

  it('CASO 6 — con el mismo numero en distinta posicion, gana el diario', async () => {
    const rows = await searchOver(
      [
        ['9999', '1234'], // solo coincide su semanal
        ['1234', '8888'], // coincide su diario
      ],
      '1234',
    )

    // Ambas aparecen: la del semanal no se descarta, solo va despues.
    expect(pairs(rows)).toEqual(['1234/8888', '9999/1234'])
  })
})

describe('search_tickets: paginacion', () => {
  it('`total_count` es el total de la busqueda, no el de la pagina', async () => {
    await db.query('begin')
    try {
      for (const [daily, weekly] of [
        ['4401', '6601'],
        ['4402', '6602'],
        ['4403', '6603'],
      ] as const) {
        await db.query(
          `insert into tickets (organization_id, raffle_id, seller_id, created_by,
                                daily_number, weekly_number, inventory_status)
           select organization_id, raffle_id, seller_id, created_by, $1, $2, 'available'
           from tickets where daily_number = '0100' limit 1`,
          [daily, weekly],
        )
      }

      const buscar = (limit: number, offset: number) =>
        db.query<SearchRow>(
          'select daily_number, total_count from search_tickets($1, p_limit => $2, p_offset => $3)',
          ['440', limit, offset],
        )

      const { rows: todo } = await buscar(500, 0)
      const { rows: page1 } = await buscar(2, 0)
      const { rows: page2 } = await buscar(2, 2)

      // Se afirma sobre el total real de la busqueda, no sobre un numero fijo:
      // las demas suites de este archivo dejan boletas creadas y un «3» a mano
      // seria una prueba que falla por lo que hizo otra.
      expect(todo.length).toBeGreaterThanOrEqual(3)
      expect(page1).toHaveLength(2)
      expect(page2.length).toBeGreaterThan(0)
      // Si `total_count` contara solo la pagina, la paginacion mentiria.
      expect(Number(page1[0]!.total_count)).toBe(todo.length)
      expect(Number(page2[0]!.total_count)).toBe(todo.length)
    } finally {
      await db.query('rollback')
    }
  })
})

/**
 * Aqui SI se prueba RLS, asi que se entra con sesiones reales y clave publica
 * (docs/TESTING.md 2). Las boletas se crean a proposito para esta seccion, con
 * numeros aleatorios, y se borran al terminar: el resto de suites deja boletas
 * creadas y afirmar sobre las del seed haria que estas pruebas fallaran por lo
 * que hizo otra (I-035).
 */
describe('search_tickets: hereda la RLS de quien busca (security invoker)', () => {
  let seller1: Client
  let seller2: Client
  let demoOwner: Client
  let controlOwner: Client

  /** Numero comun a las tres boletas: lo que se busca en cada prueba. */
  const numero = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  const creadas: string[] = []
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

    const crear = async (
      organizationId: string,
      raffleId: string,
      sellerId: string,
      weekly: string,
    ) => {
      const { data, error } = await seed.svc
        .from('tickets')
        .insert({
          organization_id: organizationId,
          raffle_id: raffleId,
          seller_id: sellerId,
          created_by: sellerId,
          daily_number: numero,
          weekly_number: weekly,
          inventory_status: 'available',
        })
        .select('id')
        .single()
      if (error) throw error
      creadas.push(data.id)
      return data.id
    }

    const otroNumero = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0')
    deSeller1 = await crear(seed.demoOrg.id, seed.demoRaffle.id, seed.ids.seller1, otroNumero())
    deSeller2 = await crear(seed.demoOrg.id, seed.demoRaffle.id, seed.ids.seller2, otroNumero())
    // Misma combinacion de numeros permitida en otra rifa y otra organizacion.
    deOtraOrg = await crear(
      seed.controlOrg.id,
      seed.controlRaffle.id,
      seed.ids.otherOrgSeller,
      otroNumero(),
    )
  })

  afterAll(async () => {
    if (creadas.length > 0) {
      await serviceClient().from('tickets').delete().in('id', creadas)
    }
  })

  const ids = (data: { id: string }[] | null) => (data ?? []).map((row) => row.id)

  it('un vendedor NO encuentra por numero la boleta de otro vendedor', async () => {
    const propia = await seller2.rpc('search_tickets', { p_search: numero })
    const ajena = await seller1.rpc('search_tickets', { p_search: numero })

    expect(propia.error).toBeNull()
    expect(ids(propia.data)).toContain(deSeller2)
    expect(ajena.error).toBeNull()
    // La boleta del otro vendedor existe y comparte numero: aun asi, no aparece.
    expect(ids(ajena.data)).not.toContain(deSeller2)
    expect(ids(ajena.data)).toContain(deSeller1)
  })

  it('el personal si encuentra las boletas de cualquier vendedor de su organizacion', async () => {
    const { data, error } = await demoOwner.rpc('search_tickets', { p_search: numero })
    expect(error).toBeNull()
    expect(ids(data)).toEqual(expect.arrayContaining([deSeller1, deSeller2]))
  })

  it('una combinacion repetida en otra organizacion no se cruza', async () => {
    const demo = await demoOwner.rpc('search_tickets', { p_search: numero })
    const control = await controlOwner.rpc('search_tickets', { p_search: numero })

    expect(ids(demo.data)).not.toContain(deOtraOrg)
    expect(ids(control.data)).toContain(deOtraOrg)
    expect(ids(control.data)).not.toContain(deSeller1)
  })

  it('los filtros acotan sin abrir nada: pedir otro vendedor no lo revela', async () => {
    const { data, error } = await seller1.rpc('search_tickets', {
      p_search: numero,
      p_seller_id: (await seller2.auth.getUser()).data.user!.id,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})
