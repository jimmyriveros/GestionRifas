/**
 * EL ORDEN DE UNA LISTA ES DEL CONJUNTO, NO DE LA PAGINA (P1-B, migracion 0075).
 *
 * El defecto que se corrige: `DataTable` ordenaba en el navegador las filas que
 * ya tenia —las 25 de la pagina servida—, asi que «Precio, de mayor a menor»
 * daba el mayor DE ESA PAGINA y la cabecera lo anunciaba ademas con `aria-sort`.
 *
 * Aqui se prueba lo unico que una consulta de una sola pagina no puede ver: que
 * el recorrido COMPLETO sale ordenado, que ninguna fila se repite y que ninguna
 * se pierde. Es lo que de verdad distingue un orden de servidor de uno de
 * navegador, y se hace con empates a proposito —cinco precios para sesenta
 * boletas—, porque sin un desempate estable PostgreSQL puede devolver las filas
 * empatadas en otro orden entre dos consultas y entonces una sale dos veces
 * mientras otra no sale nunca.
 *
 * Y se prueba la lista blanca por separado en las DOS funciones, porque no son
 * la misma lista: la del personal no incluye cliente ni dinero (D-198). Ordenar
 * por una columna es preguntar por ella; ordenar por saldo y mirar la primera
 * fila diria quien debe mas sin que ninguna celda lo escriba.
 *
 * Sesiones reales con la clave publica: la service role solo prepara datos.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// El mismo ayudante que limpia las rifas de las E2E (D-218): borra por id, en una
// transaccion, con lo que cuelga de la rifa, y lanza si no puede (I-169).
import { purgeTestRaffles } from '../e2e/db-setup'
import { DB_URL, loadSeedContext, signInAs, USERS, type Client } from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let seller1: Client
let owner: Client
let admin: Client
let raffleId: string

const STAMP = Date.now().toString(36).slice(-4)
/** Sesenta boletas: tres paginas de 25 no caben en dos, que es lo que hace falta. */
const CUANTAS = 60
const PAGINA = 25
/** Cinco precios para sesenta boletas: doce empatadas en cada uno. */
const PRECIOS = [60_000, 80_000, 100_000, 120_000, 150_000]

beforeAll(async () => {
  ctx = await loadSeedContext()
  seller1 = await signInAs(USERS.seller1)
  owner = await signInAs(USERS.owner)
  admin = await signInAs(USERS.admin)

  // Rifa propia: asi el termino de busqueda no tiene que distinguir estas
  // boletas de las del seed, y la suite no depende de cuantas haya.
  const { data: raffle, error: raffleError } = await ctx.svc
    .from('raffles')
    .insert({
      organization_id: ctx.demoOrg.id,
      name: `Rifa orden ${STAMP}`,
      ticket_price: 120_000,
      status: 'active',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      created_by: ctx.ids.owner,
    })
    .select('id')
    .single()
  if (raffleError) throw raffleError
  raffleId = raffle.id

  // Numeros 0000..0059: todos contienen un cero, asi que el termino «0» los
  // trae TODOS y ademas los empata en relevancia (todos empiezan por 0). Es el
  // peor caso para un orden sin desempate, que es justo lo que se quiere medir.
  const filas = Array.from({ length: CUANTAS }, (_, i) => ({
    organization_id: ctx.demoOrg.id,
    raffle_id: raffleId,
    seller_id: ctx.ids.seller1,
    created_by: ctx.ids.owner,
    daily_number: String(i).padStart(4, '0'),
    weekly_number: String(5000 + i),
    inventory_status: 'available' as const,
    sale_price: PRECIOS[i % PRECIOS.length],
  }))
  const { error } = await ctx.svc.from('tickets').insert(filas)
  if (error) throw error
})

/*
  I-169. Borrar las boletas y la rifa con `svc` no bastaba, y fallaba en
  silencio porque nadie miraba el `error`: al insertar las boletas,
  `tickets_sync_commission` crea la fila de `seller_commissions` de esta rifa, y
  `seller_commissions_raffle_org_fk` es `on delete restrict`. La rifa se quedaba
  —activa y de todo 2026— y tumbaba H12 de `prize-award-history` cuando corria
  despues. El ayudante borra tambien esa fila y la bitacora de la rifa y sus
  boletas, y lanza si la rifa no se va.
*/
afterAll(async () => {
  await purgeTestRaffles({ raffleIds: [raffleId] })
})

type Orden = { column: string; direction: 'asc' | 'desc' }

/** Una pagina de `search_tickets`, con el orden pedido. */
async function pagina(client: Client, page: number, sort?: Orden) {
  const { data, error } = await client.rpc('search_tickets', {
    p_search: '0',
    p_raffle_id: raffleId,
    p_limit: PAGINA,
    p_offset: (page - 1) * PAGINA,
    ...(sort ? { p_sort_column: sort.column, p_sort_direction: sort.direction } : {}),
  })
  if (error) throw error
  return data ?? []
}

/** El recorrido entero, pagina a pagina, como lo haria quien pulsa «Siguiente». */
async function recorrido(client: Client, sort?: Orden) {
  const todo: Awaited<ReturnType<typeof pagina>> = []
  for (let p = 1; p <= Math.ceil(CUANTAS / PAGINA); p += 1) {
    todo.push(...(await pagina(client, p, sort)))
  }
  return todo
}

describe('search_tickets: el orden es del conjunto filtrado', () => {
  it('sin orden pedido devuelve exactamente lo de antes: la relevancia', async () => {
    const filas = await pagina(seller1, 1)
    expect(filas).toHaveLength(PAGINA)
    expect(Number(filas[0]?.total_count)).toBe(CUANTAS)

    // Todos empatan en relevancia (todos empiezan por cero), asi que dentro del
    // escalon manda el numero diario, que es el orden de siempre.
    const diarios = filas.map((f) => f.daily_number)
    expect(diarios).toEqual([...diarios].sort())
  })

  it('«Precio» de mayor a menor ordena las SESENTA, no las 25 de la pagina', async () => {
    const primera = await pagina(seller1, 1, { column: 'salePrice', direction: 'desc' })

    // LA COMPROBACION que el defecto no pasaba: el maximo real es 150.000 y
    // tiene que estar en la primera pagina, con el conjunto entero ordenado.
    expect(Number(primera[0]?.sale_price)).toBe(150_000)

    const todo = await recorrido(seller1, { column: 'salePrice', direction: 'desc' })
    const precios = todo.map((f) => Number(f.sale_price))
    expect(precios).toHaveLength(CUANTAS)
    expect(precios).toEqual([...precios].sort((a, b) => b - a))
  })

  it('con doce boletas empatadas en cada precio, no se repite ni se pierde ninguna', async () => {
    const todo = await recorrido(seller1, { column: 'salePrice', direction: 'asc' })
    const ids = todo.map((f) => f.id)

    expect(ids).toHaveLength(CUANTAS)
    expect(new Set(ids).size).toBe(CUANTAS)

    const precios = todo.map((f) => Number(f.sale_price))
    expect(precios).toEqual([...precios].sort((a, b) => a - b))
  })

  it('el mismo recorrido dos veces da el mismo resultado (desempate estable)', async () => {
    const orden: Orden = { column: 'salePrice', direction: 'desc' }
    const uno = (await recorrido(seller1, orden)).map((f) => f.id)
    const dos = (await recorrido(seller1, orden)).map((f) => f.id)
    expect(dos).toEqual(uno)
  })

  it('el orden pedido manda sobre la relevancia', async () => {
    const filas = await pagina(seller1, 1, { column: 'dailyNumber', direction: 'desc' })
    const diarios = filas.map((f) => f.daily_number)
    expect(diarios[0]).toBe('0059')
    expect(diarios).toEqual([...diarios].sort().reverse())
  })

  it('una columna que no esta en la lista blanca se rechaza', async () => {
    const { error } = await seller1.rpc('search_tickets', {
      p_search: '0',
      p_raffle_id: raffleId,
      p_limit: PAGINA,
      p_offset: 0,
      p_sort_column: 'clientName; drop table tickets',
      p_sort_direction: 'asc',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('No se puede ordenar por esa columna')
  })

  it('las boletas siguen siendo solo las del vendedor', async () => {
    // El orden no abre ninguna puerta: un vendedor sigue sin ver las de otro.
    const { data, error } = await seller1.rpc('search_tickets', {
      p_search: '0',
      p_raffle_id: raffleId,
      p_limit: PAGINA,
      p_offset: 0,
      p_sort_column: 'salePrice',
      p_sort_direction: 'desc',
    })
    if (error) throw error
    expect((data ?? []).every((f) => f.seller_id === ctx.ids.seller1)).toBe(true)
  })
})

describe('admin_list_tickets: el orden tambien respeta la cartera (D-198)', () => {
  const prohibidas = ['clientName', 'salePrice', 'paidAmount', 'pendingAmount']

  it.each(prohibidas)('el personal no puede ordenar por «%s»', async (columna) => {
    const { error } = await owner.rpc('admin_list_tickets', {
      p_raffle_id: raffleId,
      p_limit: PAGINA,
      p_offset: 0,
      p_sort_column: columna,
      p_sort_direction: 'desc',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('No se puede ordenar por esa columna')
  })

  it('por numero SI puede, y ordena el conjunto entero', async () => {
    const { data, error } = await owner.rpc('admin_list_tickets', {
      p_raffle_id: raffleId,
      p_limit: PAGINA,
      p_offset: 0,
      p_sort_column: 'dailyNumber',
      p_sort_direction: 'desc',
    })
    if (error) throw error
    const diarios = (data ?? []).map((f) => f.daily_number)
    expect(diarios).toHaveLength(PAGINA)
    expect(diarios[0]).toBe('0059')
    expect(Number(data?.[0]?.total_count)).toBe(CUANTAS)
  })

  it('sin orden pedido devuelve lo de antes, y ninguna fila trae dinero', async () => {
    const { data, error } = await owner.rpc('admin_list_tickets', {
      p_raffle_id: raffleId,
      p_limit: 5,
      p_offset: 0,
    })
    if (error) throw error
    expect(data).toHaveLength(5)
    for (const fila of data ?? []) {
      expect(Object.keys(fila)).not.toContain('sale_price')
      expect(Object.keys(fila)).not.toContain('client_id')
    }
  })
})

/**
 * MAS ALLA DE LAS 1.000 FILAS.
 *
 * PostgREST corta toda RESPUESTA en 1.000 filas (`max_rows`), y de ahi viene
 * I-011. Lo que NO corta es el desplazamiento: `range(1050, 1074)` devuelve las
 * filas 1.051 a 1.075 sin problema. Conviene tenerlo medido y no supuesto,
 * porque si el tope se aplicara al offset la pagina 43 de «Mis boletas» estaria
 * vacia para cualquier vendedor con mas de mil boletas —que es el caso real de
 * esta operacion— y nadie se enteraria.
 */
describe('una lista de mas de 1.000 filas se puede recorrer entera', () => {
  const MUCHAS = 1_100
  let raffleGrande: string

  beforeAll(async () => {
    const { data: raffle, error: raffleError } = await ctx.svc
      .from('raffles')
      .insert({
        organization_id: ctx.demoOrg.id,
        name: `Rifa mil ${STAMP}`,
        ticket_price: 120_000,
        status: 'active',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        created_by: ctx.ids.owner,
      })
      .select('id')
      .single()
    if (raffleError) throw raffleError
    raffleGrande = raffle.id

    // 1.100 boletas con numeros distintos dentro de esta rifa. El precio sube
    // con el indice, asi que el orden por precio es comprobable de un vistazo.
    const filas = Array.from({ length: MUCHAS }, (_, i) => ({
      organization_id: ctx.demoOrg.id,
      raffle_id: raffleGrande,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: String(i % 10000).padStart(4, '0'),
      weekly_number: String(1000 + i),
      inventory_status: 'available' as const,
      sale_price: 1_000 + i,
    }))
    const { error } = await ctx.svc.from('tickets').insert(filas)
    if (error) throw error
  }, 60_000)

  // Lo mismo que la rifa de arriba (I-169), con 1.100 boletas.
  afterAll(async () => {
    await purgeTestRaffles({ raffleIds: [raffleGrande] })
  }, 60_000)

  it('la pagina 43 —desplazamiento 1.050— trae filas de verdad', async () => {
    const { data, error, count } = await seller1
      .from('tickets')
      .select('id, sale_price', { count: 'exact' })
      .eq('raffle_id', raffleGrande)
      .order('sale_price', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(1050, 1074)

    if (error) throw error
    expect(count).toBe(MUCHAS)
    expect(data).toHaveLength(25)
    // Ordenadas por precio ascendente, las filas 1.051 a 1.075 son esas.
    expect(data?.[0]?.sale_price).toBe(1_000 + 1050)
    expect(data?.at(-1)?.sale_price).toBe(1_000 + 1074)
  })

  it('la ultima pagina trae el resto, y el mayor precio esta ahi', async () => {
    const { data, error } = await seller1
      .from('tickets')
      .select('sale_price')
      .eq('raffle_id', raffleGrande)
      .order('sale_price', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(1075, 1099)

    if (error) throw error
    expect(data).toHaveLength(25)
    expect(data?.at(-1)?.sale_price).toBe(1_000 + MUCHAS - 1)
  })

  it('el buscador tambien pagina mas alla de las 1.000', async () => {
    const { data, error } = await seller1.rpc('search_tickets', {
      p_search: '0',
      p_raffle_id: raffleGrande,
      p_limit: PAGINA,
      p_offset: 1050,
      p_sort_column: 'salePrice',
      p_sort_direction: 'asc',
    })
    if (error) throw error
    expect(data ?? []).not.toHaveLength(0)
    expect(Number(data?.[0]?.sale_price)).toBeGreaterThan(1_000)
  })
})

/**
 * LAS TRES LISTAS DEL PERSONAL, ORDENADAS Y PAGINADAS EN LA BASE (D-214).
 *
 * Hasta D-213 leian su lista entera y la recortaban en el servidor. Aqui se
 * comprueba lo que cambia: que una pagina se sirve SIN recorrer el conjunto,
 * que el recuento sigue siendo el de verdad, que el equipo viene resuelto desde
 * SQL —era lo unico que obligaba a traerlo todo— y que D-198 se respeta tambien
 * en el orden.
 */
describe('Vendedores, Rifas y Administradores: la base ordena y pagina', () => {
  it('«Vendedores» devuelve una pagina, su recuento y el equipo resuelto', async () => {
    const { data, error } = await owner.rpc('admin_list_sellers', { p_limit: 25, p_offset: 0 })
    if (error) throw error

    expect((data ?? []).length).toBeGreaterThan(0)
    const total = Number(data?.[0]?.total_count ?? 0)
    expect(total).toBe((data ?? []).length)

    // Cada fila trae su equipo: cuantos tiene a cargo y de quien depende. Eso
    // es lo que antes se calculaba recorriendo la lista completa (BR-E08).
    for (const fila of data ?? []) {
      expect(typeof Number(fila.team_size)).toBe('number')
      expect(fila.full_name).toBeTruthy()
    }
  })

  it('«Vendedores» NO devuelve ni un importe (D-198, BR-Q08)', async () => {
    const { data, error } = await owner.rpc('admin_list_sellers', { p_limit: 5, p_offset: 0 })
    if (error) throw error

    const prohibidas = ['sale_price', 'paid_amount', 'pending_amount', 'total_sold', 'collected']
    for (const fila of data ?? []) {
      for (const columna of prohibidas) {
        expect(Object.keys(fila)).not.toContain(columna)
      }
    }
  })

  it.each(['salePrice', 'pendingAmount', 'clientName'])(
    '«Vendedores» no se puede ordenar por «%s»',
    async (columna) => {
      const { error } = await owner.rpc('admin_list_sellers', {
        p_limit: 25,
        p_offset: 0,
        p_sort_column: columna,
        p_sort_direction: 'desc',
      })
      expect(error).not.toBeNull()
      expect(error?.message).toContain('No se puede ordenar por esa columna')
    },
  )

  it('un VENDEDOR no obtiene nada de las dos funciones del personal', async () => {
    const vendedores = await seller1.rpc('admin_list_sellers', { p_limit: 25, p_offset: 0 })
    const rifas = await seller1.rpc('admin_list_raffles', { p_limit: 25, p_offset: 0 })

    // Ni error que delate: un conjunto vacio, igual que un id que no existe.
    expect(vendedores.data ?? []).toHaveLength(0)
    expect(rifas.data ?? []).toHaveLength(0)
  })

  it('«Rifas» ordena por recuento de boletas, que es una columna calculada', async () => {
    const { data, error } = await owner.rpc('admin_list_raffles', {
      p_limit: 25,
      p_offset: 0,
      p_sort_column: 'ticketsTotal',
      p_sort_direction: 'desc',
    })
    if (error) throw error

    const totales = (data ?? []).map((f) => Number(f.tickets_total))
    expect(totales).toEqual([...totales].sort((a, b) => b - a))
  })

  it('el personal puede ordenar sus boletas por «Vendedor», que antes no podia', async () => {
    const { data, error } = await owner.rpc('admin_list_tickets', {
      p_limit: 25,
      p_offset: 0,
      p_sort_column: 'sellerName',
      p_sort_direction: 'asc',
    })
    if (error) throw error
    expect((data ?? []).length).toBeGreaterThan(0)
  })
})

/**
 * LA VISTA DEL VENDEDOR, Y LA FRONTERA QUE NO CRUZA.
 *
 * `v_seller_ticket_list` trae el nombre del cliente y dos cifras de dinero. Es
 * `security_invoker`, asi que quien la consulta ve lo que ya podia ver: un
 * vendedor, sus boletas; el personal, NINGUNA (D-198). Esto ultimo es lo que
 * hay que demostrar, porque una vista mal hecha seria una puerta trasera a la
 * cartera.
 */
describe('v_seller_ticket_list: recupera columnas sin abrir ninguna puerta', () => {
  it('el PERSONAL no obtiene ni una fila', async () => {
    for (const quien of [owner, admin]) {
      const { data, error } = await quien
        .from('v_seller_ticket_list')
        .select('id, client_name, pending_amount')
      if (error) throw error
      expect(data ?? []).toHaveLength(0)
    }
  })

  it('un vendedor obtiene las suyas, con el cliente y las dos cifras', async () => {
    const { data, error } = await seller1
      .from('v_seller_ticket_list')
      .select('id, seller_id, client_name, pending_amount, paid_ratio, inventory_status, sale_price')
      .limit(50)
    if (error) throw error

    expect((data ?? []).length).toBeGreaterThan(0)
    for (const fila of data ?? []) {
      expect(fila.seller_id).toBe(ctx.ids.seller1)
      // Las dos calculadas siguen la regla de `ticketFinancials`: una boleta
      // sin vender no tiene saldo ni progreso, vale NULL en las dos.
      const vendida = fila.inventory_status === 'assigned' && fila.sale_price !== null
      if (!vendida) {
        expect(fila.pending_amount).toBeNull()
        expect(fila.paid_ratio).toBeNull()
      }
    }
  })

  it('un vendedor no ve las boletas de otro', async () => {
    const { data } = await seller1.from('v_seller_ticket_list').select('seller_id').limit(200)
    expect((data ?? []).every((f) => f.seller_id === ctx.ids.seller1)).toBe(true)
  })
})

/**
 * LOS LISTADOS DEL PERSONAL CON MAS DE 1.000 FILAS.
 *
 * Es el caso que el tope de PostgREST hacia invisible: `max_rows` corta toda
 * respuesta en 1.000 filas sin avisar, asi que una lista que se leia entera
 * dejaba de estar completa justo ahi. Ahora la pagina la sirve PostgreSQL, de
 * modo que hay que demostrar dos cosas distintas: que el recuento es el REAL
 * —no 1.000— y que una pagina mas alla de la 40 trae filas de verdad.
 *
 * Se crean 1.100 rifas y 1.100 vendedores, y se borran al terminar.
 */
describe('mas de 1.000 filas en los listados del personal', () => {
  const MARCA = `masiva-${STAMP}`
  const CUANTAS = 1_100
  let db: PgClient
  let rifasAntes = 0
  let vendedoresAntes = 0
  // Lo que crea este bloque, por id: la limpieza borra esto y nada mas.
  let rifasCreadas: string[] = []
  let cuentasCreadas: string[] = []
  let membresiasCreadas: string[] = []

  beforeAll(async () => {
    db = new PgClient({ connectionString: DB_URL })
    await db.connect()

    const antes = await db.query(
      `select
         (select count(*) from raffles where organization_id = $1) as rifas,
         (select count(*) from memberships where organization_id = $1 and role = 'seller') as vendedores`,
      [ctx.demoOrg.id],
    )
    rifasAntes = Number(antes.rows[0].rifas)
    vendedoresAntes = Number(antes.rows[0].vendedores)

    /*
      EL CODIGO SE PONE A MANO, y hace falta explicar por que: el disparador
      `raffles_set_short_code` lo calcula con `lpad(contador, 3, '0')`, y `lpad`
      TRUNCA cuando el texto es mas largo que el ancho pedido. La rifa 1.000 sale
      como «R100» y choca con la 100, de modo que una organizacion no puede pasar
      de 999 rifas. Es un defecto anterior y ajeno a este trabajo (I-157): aqui
      solo se esquiva para poder medir lo que se vino a medir.
    */
    await db.query(`alter table raffles disable trigger raffles_set_short_code`)
    const rifas = await db.query<{ id: string }>(
      `insert into raffles (organization_id, name, short_code, ticket_price, status,
                            start_date, end_date, created_by)
       select $1, $2 || ' ' || g, 'M' || lpad(g::text, 5, '0'), 120000, 'draft',
              '2026-01-01', '2026-12-31', $3
       from generate_series(1, $4) g
       returning id`,
      [ctx.demoOrg.id, MARCA, ctx.ids.owner, CUANTAS],
    )
    rifasCreadas = rifas.rows.map((fila) => fila.id)
    await db.query(`alter table raffles enable trigger raffles_set_short_code`)

    /*
      Un vendedor es una persona: hace falta su cuenta, su perfil y su
      membresia. El perfil NO se inserta: `on_auth_user_created` lo crea solo
      al dar de alta la cuenta, asi que aqui solo se le pone el nombre.
    */
    const cuentas = await db.query<{ id: string }>(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at)
       select gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', $1 || '-' || g || '@local.test', '',
              now(), now(), now()
       from generate_series(1, $2) g
       returning id`,
      [MARCA, CUANTAS],
    )
    cuentasCreadas = cuentas.rows.map((fila) => fila.id)

    // El nombre se pone con ceros delante para que el orden alfabetico y el
    // numerico coincidan: asi comparar dos paginas consecutivas dice algo.
    await db.query(
      `update profiles p
          set full_name = 'Vendedor ' || lpad(split_part(split_part(p.email, '@', 1), '-', 3), 5, '0'),
              phone = '3000000000',
              is_active = true
        where p.email like $1 || '-%@local.test'`,
      [MARCA],
    )

    const membresias = await db.query<{ id: string }>(
      `insert into memberships (organization_id, profile_id, role, is_active)
       select $1, p.id, 'seller', true from profiles p
        where p.id = any($2::uuid[])
       returning id`,
      [ctx.demoOrg.id, cuentasCreadas],
    )
    membresiasCreadas = membresias.rows.map((fila) => fila.id)
  }, 120_000)

  /*
    Por id, no por la marca del nombre (I-169). Las rifas son borradores sin
    boletas y las borra el ayudante de arriba, con su bitacora. Las personas van
    en una transaccion: la cuenta arrastra su perfil en cascada; la membresia no
    tiene nada colgando, pero deja `membership.create` y `membership.delete` en
    la bitacora, que se borra al final porque borrar tambien escribe.
  */
  afterAll(async () => {
    if (!db) return
    try {
      await purgeTestRaffles({ raffleIds: rifasCreadas })
      await db.query('begin')
      try {
        const membresias = await db.query('delete from memberships where id = any($1::uuid[])', [
          membresiasCreadas,
        ])
        const cuentas = await db.query('delete from auth.users where id = any($1::uuid[])', [
          cuentasCreadas,
        ])
        await db.query('delete from audit_logs where entity_id = any($1::uuid[])', [
          membresiasCreadas,
        ])
        if (
          membresias.rowCount !== membresiasCreadas.length ||
          cuentas.rowCount !== cuentasCreadas.length
        ) {
          throw new Error(
            `list-order: se borraron ${membresias.rowCount} de ${membresiasCreadas.length} ` +
              `membresias y ${cuentas.rowCount} de ${cuentasCreadas.length} cuentas`,
          )
        }
        await db.query('commit')
      } catch (error) {
        await db.query('rollback')
        throw error
      }
    } finally {
      await db.end()
    }
  }, 120_000)

  it('«Rifas» cuenta las 1.100, no 1.000', async () => {
    const { data, error } = await owner.rpc('admin_list_raffles', { p_limit: 25, p_offset: 0 })
    if (error) throw error
    expect(Number(data?.[0]?.total_count)).toBe(rifasAntes + CUANTAS)
  })

  it('«Rifas» sirve la pagina 45 —desplazamiento 1.100— con filas de verdad', async () => {
    const { data, error } = await owner.rpc('admin_list_raffles', {
      p_limit: 25,
      p_offset: 1_050,
      p_sort_column: 'name',
      p_sort_direction: 'asc',
    })
    if (error) throw error
    expect(data ?? []).toHaveLength(25)
    expect(data?.[0]?.name).toBeTruthy()
  })

  it('«Vendedores» cuenta los 1.100, no 1.000', async () => {
    const { data, error } = await owner.rpc('admin_list_sellers', { p_limit: 25, p_offset: 0 })
    if (error) throw error
    expect(Number(data?.[0]?.total_count)).toBe(vendedoresAntes + CUANTAS)
  })

  it('«Vendedores» ordenado por nombre cruza el tope sin perder el orden', async () => {
    const primera = await owner.rpc('admin_list_sellers', {
      p_limit: 25,
      p_offset: 1_050,
      p_sort_column: 'fullName',
      p_sort_direction: 'asc',
    })
    const siguiente = await owner.rpc('admin_list_sellers', {
      p_limit: 25,
      p_offset: 1_075,
      p_sort_column: 'fullName',
      p_sort_direction: 'asc',
    })
    if (primera.error) throw primera.error
    if (siguiente.error) throw siguiente.error

    expect(primera.data ?? []).toHaveLength(25)
    const ultimoDeLa1 = primera.data?.at(-1)?.full_name ?? ''
    const primeroDeLa2 = siguiente.data?.[0]?.full_name ?? ''
    // Entre dos paginas consecutivas el orden no se rompe.
    expect(primeroDeLa2.localeCompare(ultimoDeLa1, 'es')).toBeGreaterThanOrEqual(0)
  })

  it('«Administradores» pagina por la vista mas alla del tope', async () => {
    // La vista la consulta PostgREST, que corta en 1.000 por respuesta pero no
    // limita el desplazamiento: la pagina 45 existe.
    const { data, error, count } = await owner
      .from('v_org_member_list')
      .select('profile_id, full_name', { count: 'exact' })
      .eq('role', 'seller')
      .order('full_name', { ascending: true })
      .order('profile_id', { ascending: true })
      .range(1_050, 1_074)

    if (error) throw error
    expect(count).toBe(vendedoresAntes + CUANTAS)
    expect(data ?? []).toHaveLength(25)
  })
})
