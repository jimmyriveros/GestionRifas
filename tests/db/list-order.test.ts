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
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadSeedContext, signInAs, USERS, type Client } from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let seller1: Client
let owner: Client
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

afterAll(async () => {
  if (raffleId) {
    await ctx.svc.from('tickets').delete().eq('raffle_id', raffleId)
    await ctx.svc.from('raffles').delete().eq('id', raffleId)
  }
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

  afterAll(async () => {
    if (raffleGrande) {
      await ctx.svc.from('tickets').delete().eq('raffle_id', raffleGrande)
      await ctx.svc.from('raffles').delete().eq('id', raffleGrande)
    }
  })

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
