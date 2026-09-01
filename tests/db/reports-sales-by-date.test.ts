/**
 * Reporte «Ventas por fecha» (D-151, BR-T05, migracion `0040`).
 *
 * EL CRITERIO ES EL DE LA FASE 6: cada cifra que la pantalla enseña tiene que
 * ser reproducible con una consulta SQL de control, escrita a mano contra las
 * tablas base y sin pasar por la funcion que se esta probando. Lo que se PRUEBA
 * se pide siempre con una sesion real y la clave publica, nunca con la service
 * role (D-043); la service role solo PREPARA datos.
 *
 * POR QUE LAS VENTAS DE PRUEBA ESTAN EN 2020
 *
 * `report_sales_totals` no acepta rifa ni vendedor: agrega TODO lo que la RLS
 * deja ver dentro de un rango de fechas. Si estas pruebas usaran fechas de hoy,
 * las boletas que crean otras suites —y las del seed— entrarian en la cuenta y
 * los numeros dependerian del orden de ejecucion (la trampa de I-035). Una
 * ventana de marzo de 2020, que ningun otro sitio toca, aisla el conjunto sin
 * tener que aislar la base.
 *
 * Ademas, esa ventana demuestra sola la regla principal: las boletas se crean y
 * se asignan HOY —`created_at` y `assigned_at` son de hoy— y aun asi cuentan en
 * marzo de 2020, porque lo unico que las fecha es `sale_date`.
 *
 * Reglas cubiertas: BR-T05, BR-F07, BR-F08, BR-U07, BR-P03.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DB_URL, loadSeedContext, randomNumbers, signInAs, USERS, type Client } from './helpers'

/** Ventana de prueba: un mes que no usa ninguna otra suite ni el seed. */
const DESDE = '2020-03-01'
const HASTA = '2020-03-31'
/** Un dia anterior a la ventana, para la venta que NO debe aparecer. */
const FUERA = '2020-02-15'

/** Mas de una pagina de 25 filas, para que los totales no puedan salir de ella. */
const VENTAS_SELLER1 = 27

let db: PgClient
let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let owner: Client
let seller1: Client
let seller2: Client
let otherOrgSeller: Client

let precio: number
/** Boletas de vendedor1 dentro de la ventana, en el mismo orden en que se crearon. */
let ventasSeller1: string[] = []
let ventasSeller2: string[] = []
let ventasOtraOrg: string[] = []
/** Todo lo creado aqui, para borrarlo al terminar. */
const creadas: string[] = []
const pagosCreados: string[] = []

/**
 * Crea boletas disponibles y las vende con una fecha de venta concreta.
 *
 * Va por `assign_ticket`, que es el camino real de una venta: copia el precio
 * de la rifa (BR-P03) y acepta la fecha como parametro. `assigned_at` se queda
 * en HOY, que es justo lo que hace util a esta prueba.
 */
async function venderBoletas(params: {
  session: Client
  organizationId: string
  raffleId: string
  sellerId: string
  createdBy: string
  clientId: string
  fechas: readonly string[]
}): Promise<string[]> {
  const filas = params.fechas.map(() => {
    const { daily, weekly } = randomNumbers()
    return {
      organization_id: params.organizationId,
      raffle_id: params.raffleId,
      seller_id: params.sellerId,
      created_by: params.createdBy,
      daily_number: daily,
      weekly_number: weekly,
      inventory_status: 'available' as const,
    }
  })

  const { data, error } = await ctx.svc.from('tickets').insert(filas).select('id')
  if (error) throw new Error(`No se pudieron crear las boletas: ${error.message}`)

  const ids = (data ?? []).map((row) => row.id)
  creadas.push(...ids)

  for (const [index, id] of ids.entries()) {
    const { error: assignError } = await params.session.rpc('assign_ticket', {
      p_ticket_id: id,
      p_client_id: params.clientId,
      p_sale_date: params.fechas[index],
    })
    if (assignError) throw new Error(`No se pudo vender la boleta: ${assignError.message}`)
  }

  return ids
}

/** Primer valor de la primera fila de una consulta de control (superusuario). */
async function control<T = number>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params)
  return Object.values(rows[0])[0] as T
}

/** Los cuatro indicadores, pedidos con una sesion real. */
async function totales(session: Client, desde = DESDE, hasta = HASTA) {
  const { data, error } = await session
    .rpc('report_sales_totals', { p_date_from: desde, p_date_to: hasta })
    .maybeSingle()
  expect(error).toBeNull()
  return {
    ticketsCount: Number(data?.tickets_count ?? 0),
    totalSold: Number(data?.total_sold ?? 0),
    paidAmount: Number(data?.paid_amount ?? 0),
    pendingAmount: Number(data?.pending_amount ?? 0),
  }
}

beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  ctx = await loadSeedContext()
  owner = await signInAs(USERS.owner)
  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
  otherOrgSeller = await signInAs(USERS.otherOrgSeller)

  // El precio se LEE de la rifa, no se escribe a mano: cambiarlo no debe
  // convertir esta suite en una lista de fallos falsos (D-098).
  const { data: raffle } = await ctx.svc
    .from('raffles')
    .select('ticket_price')
    .eq('id', ctx.demoRaffle.id)
    .single()
  precio = raffle!.ticket_price

  // 27 ventas de vendedor1 repartidas en tres dias de la ventana.
  const dias = ['2020-03-05', '2020-03-10', '2020-03-20']
  ventasSeller1 = await venderBoletas({
    session: seller1,
    organizationId: ctx.demoOrg.id,
    raffleId: ctx.demoRaffle.id,
    sellerId: ctx.ids.seller1,
    createdBy: ctx.ids.owner,
    clientId: ctx.clients.ana.id,
    fechas: Array.from({ length: VENTAS_SELLER1 }, (_, i) => dias[i % dias.length]!),
  })

  // Una venta suya FUERA de la ventana.
  await venderBoletas({
    session: seller1,
    organizationId: ctx.demoOrg.id,
    raffleId: ctx.demoRaffle.id,
    sellerId: ctx.ids.seller1,
    createdBy: ctx.ids.owner,
    clientId: ctx.clients.ana.id,
    fechas: [FUERA],
  })

  // Dos ventas de vendedor2 DENTRO de la ventana: el aislamiento entre
  // vendedores se prueba con datos que solo el rango no separaria.
  ventasSeller2 = await venderBoletas({
    session: seller2,
    organizationId: ctx.demoOrg.id,
    raffleId: ctx.demoRaffle.id,
    sellerId: ctx.ids.seller2,
    createdBy: ctx.ids.owner,
    clientId: ctx.clients.diego.id,
    fechas: ['2020-03-10', '2020-03-11'],
  })

  // Y una venta en la OTRA organizacion, tambien dentro de la ventana.
  ventasOtraOrg = await venderBoletas({
    session: otherOrgSeller,
    organizationId: ctx.controlOrg.id,
    raffleId: ctx.controlRaffle.id,
    sellerId: ctx.ids.otherOrgSeller,
    createdBy: ctx.ids.otherOrgSeller,
    clientId: ctx.clients.fabio.id,
    fechas: ['2020-03-15'],
  })
}, 120_000)

/**
 * Borra todo lo creado: estas ventas alterarian los totales de la organizacion
 * que comprueban otras suites.
 *
 * VA EN UNA SOLA TRANSACCION Y POR LA CONEXION DE SUPERUSUARIO, no en seis
 * peticiones a PostgREST. `check_payment_balance` comprueba al cerrar CADA
 * transaccion que la suma de las asignaciones de un pago siga siendo igual a su
 * total: borrar las asignaciones en una peticion y el pago en la siguiente deja
 * un pago descuadrado a mitad de camino y la primera peticion falla con
 * «El pago no cuadra». Es la misma razon por la que F9-02 borra asi
 * (docs/TESTING.md §6.1), y `DELETE` está revocado para la aplicacion (`0010`)
 * precisamente para que esto solo sea posible aqui.
 *
 * Y falla RUIDOSAMENTE. La primera version usaba `ctx.svc` e ignoraba el error
 * que devolvia: la limpieza no ocurria, cada ejecucion dejaba 27 ventas mas en
 * la ventana y la suite empezaba a fallar contra sus propios restos.
 */
afterAll(async () => {
  if (creadas.length > 0) {
    await db.query('begin')
    try {
      await db.query(`delete from payment_allocations where ticket_id = any($1::uuid[])`, [creadas])
      await db.query(`delete from payments where id = any($1::uuid[])`, [pagosCreados])
      await db.query(`delete from lottery_ticket_matches where ticket_id = any($1::uuid[])`, [
        creadas,
      ])
      await db.query(`delete from notifications where entity_id = any($1::uuid[])`, [creadas])
      await db.query(`delete from commission_ledger where ticket_id = any($1::uuid[])`, [creadas])
      await db.query(`delete from tickets where id = any($1::uuid[])`, [creadas])
      await db.query('commit')
    } catch (error) {
      await db.query('rollback')
      throw error
    }
  }
  await db.end()
}, 120_000)

// ===========================================================================
// D151-01 — los cuatro indicadores cuadran con SQL directo
// ===========================================================================

describe('D151-01 los indicadores coinciden con una consulta de control', () => {
  it('el conteo del rango coincide con un count directo sobre tickets', async () => {
    const esperado = await control<number>(
      `select count(*)::int from tickets
       where seller_id = $1 and inventory_status = 'assigned'
         and sale_date between $2 and $3`,
      [ctx.ids.seller1, DESDE, HASTA],
    )

    expect(esperado).toBe(VENTAS_SELLER1)
    expect((await totales(seller1)).ticketsCount).toBe(esperado)
  })

  it('`total_sold` coincide con SUM(sale_price), no con el precio de la rifa', async () => {
    const esperado = await control<string>(
      `select coalesce(sum(sale_price), 0)::text from tickets
       where seller_id = $1 and inventory_status = 'assigned'
         and sale_date between $2 and $3`,
      [ctx.ids.seller1, DESDE, HASTA],
    )

    expect((await totales(seller1)).totalSold).toBe(Number(esperado))
  })

  it('`paid_amount` coincide con la suma de las asignaciones NO anuladas', async () => {
    // No se compara contra `tickets.paid_amount`, que es la columna que se
    // quiere verificar, sino contra el dinero real de los pagos vigentes
    // (BR-F07/BR-F08). Asi la prueba detecta tambien un disparador roto.
    const esperado = await control<string>(
      `select coalesce(sum(pa.amount), 0)::text
         from payment_allocations pa
         join tickets t   on t.id = pa.ticket_id
         join payments p  on p.id = pa.payment_id
        where t.seller_id = $1 and t.inventory_status = 'assigned'
          and t.sale_date between $2 and $3
          and p.voided_at is null`,
      [ctx.ids.seller1, DESDE, HASTA],
    )

    expect((await totales(seller1)).paidAmount).toBe(Number(esperado))
  })

  it('se cumple exactamente `total vendido - abonado = saldo pendiente`', async () => {
    const t = await totales(seller1)
    expect(t.totalSold - t.paidAmount).toBe(t.pendingAmount)
  })

  it('los totales son exactos con MAS filas que una pagina', async () => {
    // La pagina trae 25 filas; los totales cuentan las 27. Si alguien moviera
    // la suma a la pagina visible, esta comprobacion lo delataria.
    const { data, error } = await seller1
      .from('tickets')
      .select('id')
      .eq('inventory_status', 'assigned')
      .gte('sale_date', DESDE)
      .lte('sale_date', HASTA)
      .range(0, 24)

    expect(error).toBeNull()
    expect(data).toHaveLength(25)

    const t = await totales(seller1)
    expect(t.ticketsCount).toBe(VENTAS_SELLER1)
    expect(t.totalSold).toBe(precio * VENTAS_SELLER1)
  })
})

// ===========================================================================
// D151-02 — que cuenta como venta, y con que fecha
// ===========================================================================

describe('D151-02 la fecha es `sale_date` y solo cuentan las vendidas', () => {
  it('una venta fuera del rango no aparece', async () => {
    const dentro = await totales(seller1)
    const conFuera = await totales(seller1, FUERA, HASTA)

    expect(dentro.ticketsCount).toBe(VENTAS_SELLER1)
    expect(conFuera.ticketsCount).toBe(VENTAS_SELLER1 + 1)
  })

  it('la fecha que manda es `sale_date`, no `created_at` ni `assigned_at`', async () => {
    // Las 27 boletas se crearon y se asignaron AHORA; su `sale_date` es de 2020.
    // Si el reporte usara cualquiera de esas dos marcas, la ventana estaria
    // vacia. Se compara contra `sale_date`, no contra «hoy»: `current_date` es
    // el dia UTC del contenedor y a partir de las 19:00 de Bogota ya no es el
    // mismo dia, asi que anclar la prueba a «hoy» la haria fallar de noche.
    const desfasadas = await control<number>(
      `select count(*)::int from tickets
        where id = any($1::uuid[])
          and assigned_at::date > sale_date and created_at::date > sale_date`,
      [ventasSeller1],
    )
    expect(desfasadas).toBe(VENTAS_SELLER1)

    expect((await totales(seller1)).ticketsCount).toBe(VENTAS_SELLER1)
  })

  it('una boleta anulada deja de contar como venta', async () => {
    const antes = await totales(seller1)

    // La boleta se crea AQUI, solo para anularla. `cancelled -> assigned` no es
    // una transicion valida (`tickets_validate_status_transition`, 0004), asi
    // que una boleta anulada no se puede devolver a su sitio: anular una de las
    // 27 dejaria a todas las pruebas siguientes contando 26. Crear una aparte
    // demuestra ademas las dos direcciones —entra al venderse, sale al
    // anularse— en vez de solo una.
    const [extra] = await venderBoletas({
      session: seller1,
      organizationId: ctx.demoOrg.id,
      raffleId: ctx.demoRaffle.id,
      sellerId: ctx.ids.seller1,
      createdBy: ctx.ids.owner,
      clientId: ctx.clients.ana.id,
      fechas: ['2020-03-05'],
    })

    const conExtra = await totales(seller1)
    expect(conExtra.ticketsCount).toBe(antes.ticketsCount + 1)
    expect(conExtra.totalSold).toBe(antes.totalSold + precio)

    const { error } = await owner.rpc('cancel_ticket', {
      p_ticket_id: extra!,
      p_reason: 'Anulada para comprobar el reporte de ventas por fecha',
    })
    expect(error).toBeNull()

    const despues = await totales(seller1)
    expect(despues.ticketsCount).toBe(antes.ticketsCount)
    expect(despues.totalSold).toBe(antes.totalSold)
  })

  it('un rango de un solo dia devuelve solo las ventas de ese dia', async () => {
    const esperado = await control<number>(
      `select count(*)::int from tickets
        where seller_id = $1 and inventory_status = 'assigned' and sale_date = '2020-03-05'`,
      [ctx.ids.seller1],
    )

    const t = await totales(seller1, '2020-03-05', '2020-03-05')
    expect(t.ticketsCount).toBe(esperado)
    expect(t.ticketsCount).toBeGreaterThan(0)
  })
})

// ===========================================================================
// D151-03 — aislamiento con sesiones reales
// ===========================================================================

describe('D151-03 cada vendedor solo ve sus ventas (BR-U07)', () => {
  it('vendedor1 no cuenta las ventas de vendedor2, aunque sean del mismo dia', async () => {
    const t1 = await totales(seller1)
    expect(t1.ticketsCount).toBe(VENTAS_SELLER1)

    // Las de vendedor2 existen y estan dentro de la ventana...
    const totalDeLaVentana = await control<number>(
      `select count(*)::int from tickets
        where organization_id = $1 and inventory_status = 'assigned'
          and sale_date between $2 and $3`,
      [ctx.demoOrg.id, DESDE, HASTA],
    )
    expect(totalDeLaVentana).toBe(VENTAS_SELLER1 + ventasSeller2.length)

    // ...y aun asi no entran en la cuenta de vendedor1.
    const t2 = await totales(seller2)
    expect(t2.ticketsCount).toBe(ventasSeller2.length)
  })

  it('un vendedor no obtiene las ventas de otro pasando su id en la URL', async () => {
    // La funcion NO acepta vendedor: no hay parametro que manipular. Y la
    // consulta de filas, que si admite filtros, tampoco sirve para eso.
    const { data, error } = await seller1
      .from('tickets')
      .select('id')
      .eq('seller_id', ctx.ids.seller2)
      .eq('inventory_status', 'assigned')
      .gte('sale_date', DESDE)
      .lte('sale_date', HASTA)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('el personal ve la organizacion entera, y solo la suya', async () => {
    const t = await totales(owner)
    expect(t.ticketsCount).toBe(VENTAS_SELLER1 + ventasSeller2.length)
  })

  it('la otra organizacion queda aislada en los dos sentidos', async () => {
    const ajena = await totales(otherOrgSeller)
    expect(ajena.ticketsCount).toBe(ventasOtraOrg.length)

    // Y el dueño de la organizacion demo no ve la venta de la organizacion
    // control, aunque caiga dentro de la misma ventana.
    const { data } = await owner.from('tickets').select('id').in('id', ventasOtraOrg)
    expect(data).toEqual([])
  })

  it('`anon` no puede ejecutar la funcion', async () => {
    const { anonClient } = await import('./helpers')
    const { error } = await anonClient()
      .rpc('report_sales_totals', { p_date_from: DESDE, p_date_to: HASTA })
      .maybeSingle()

    expect(error).not.toBeNull()
  })
})

// ===========================================================================
// D151-04 — el dinero se mueve, la fecha de la venta no
// ===========================================================================

describe('D151-04 abonos y anulaciones', () => {
  it('un abono posterior sube «Abonado» y baja el saldo sin mover la venta de fecha', async () => {
    const antes = await totales(seller1)
    const boleta = ventasSeller1[1]!
    const abono = 20_000

    const { data: pagoId, error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: abono,
      p_allocations: [{ ticket_id: boleta, amount: abono }],
    })
    expect(error).toBeNull()
    pagosCreados.push(pagoId as unknown as string)

    const despues = await totales(seller1)
    expect(despues.paidAmount).toBe(antes.paidAmount + abono)
    expect(despues.pendingAmount).toBe(antes.pendingAmount - abono)
    // La venta sigue siendo del mismo dia: el abono es de hoy y no la arrastra.
    expect(despues.ticketsCount).toBe(antes.ticketsCount)
    expect(despues.totalSold).toBe(antes.totalSold)

    const fecha = await control<string>(`select sale_date::text from tickets where id = $1`, [
      boleta,
    ])
    expect(fecha).toBe('2020-03-10')
  })

  it('el dia del abono NO cambia el dia de la venta', async () => {
    // El pago se registro hoy y la venta sigue contando en 2020: es la
    // distincion entre este reporte y «Pagos por fecha». Se compara contra el
    // fin de la ventana y no contra `current_date`, por la misma razon de zona
    // horaria que la prueba de `sale_date`.
    const posteriores = await control<number>(
      `select count(*)::int from payments where id = any($1::uuid[]) and payment_date > $2::date`,
      [pagosCreados, HASTA],
    )
    expect(posteriores).toBe(pagosCreados.length)
    expect(pagosCreados.length).toBeGreaterThan(0)
    expect((await totales(seller1)).ticketsCount).toBe(VENTAS_SELLER1)
  })

  it('un pago anulado deja de contar en «Abonado»', async () => {
    const antes = await totales(seller1)
    const pago = pagosCreados[0]!

    const { error } = await owner.rpc('void_payment', {
      p_payment_id: pago,
      p_reason: 'Anulado para comprobar el reporte de ventas por fecha',
    })
    expect(error).toBeNull()

    const despues = await totales(seller1)
    expect(despues.paidAmount).toBe(antes.paidAmount - 20_000)
    expect(despues.pendingAmount).toBe(antes.pendingAmount + 20_000)
    expect(despues.totalSold - despues.paidAmount).toBe(despues.pendingAmount)
  })
})

// ===========================================================================
// D151-05 — catalogo
// ===========================================================================

describe('D151-05 la funcion tiene las propiedades que la hacen segura', () => {
  it('es `stable`, `security invoker` y fija `search_path`', async () => {
    const { rows } = await db.query(`
      select p.provolatile, p.prosecdef, array_to_string(p.proconfig, ',') as config
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'report_sales_totals'
    `)

    expect(rows).toHaveLength(1)
    expect(rows[0].provolatile).toBe('s')
    expect(rows[0].prosecdef).toBe(false)
    expect(rows[0].config).toContain('search_path=public, pg_temp')
  })

  it('la puede ejecutar `authenticated` y no `anon` ni `public`', async () => {
    const { rows } = await db.query(`
      select has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
             has_function_privilege('anon', p.oid, 'EXECUTE')          as anon
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'report_sales_totals'
    `)

    expect(rows[0].auth).toBe(true)
    expect(rows[0].anon).toBe(false)
  })

  it('el indice de ventas por fecha existe con la forma que se midio', async () => {
    const { rows } = await db.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = 'public' and indexname = 'tickets_sale_date_idx'`,
    )

    expect(rows).toHaveLength(1)
    // El orden de las columnas y la condicion parcial NO son decorativos: son
    // lo que permite al planificador recorrer el indice ya ordenado y detenerse
    // en la pagina pedida. Y NO empieza por `seller_id` a proposito: se midio y
    // es peor, por la misma razon de D-102. Quien lo «mejore» poniendo el
    // vendedor delante rompe esta prueba, que es justo lo que debe pasar.
    expect(rows[0]!.indexdef).toMatch(
      /\(sale_date DESC, assigned_at DESC\) WHERE \(inventory_status = 'assigned'/,
    )
    expect(rows[0]!.indexdef).not.toContain('seller_id')
  })
})
