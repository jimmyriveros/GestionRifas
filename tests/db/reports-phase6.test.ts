/**
 * Pruebas de base de datos de la Fase 6: dashboards y reportes.
 *
 * EL CRITERIO DE ESTA FASE (docs/IMPLEMENTATION_PLAN.md, Fase 6):
 * «cada numero mostrado es reproducible con una consulta SQL de control».
 *
 * Por eso casi todas las pruebas de aqui tienen la misma forma: se calcula el
 * valor con una consulta INDEPENDIENTE contra las tablas base —escrita a mano,
 * sin pasar por las vistas ni por las funciones que se estan probando— y se
 * compara con lo que obtiene una sesion real. Si una vista se desincroniza del
 * dato crudo, estas pruebas lo dicen.
 *
 * La consulta de control usa `pg` directo (superusuario) a proposito: sirve de
 * fuente de verdad. Lo que se PRUEBA se pide siempre con una sesion real y la
 * clave publica, nunca con la service role (D-043).
 *
 * DESDE D-198 EL PERSONAL NO AGREGA DINERO. Las vistas y las funciones de
 * reporte son `security_invoker`, y el Dueño y el Administrador ya no leen
 * `tickets`, `payments` ni `clients`: les suman cero, y las pruebas lo dicen.
 * Sus recuentos llegan por `admin_ticket_inventory`, que se compara con SQL
 * igual que antes se comparaban las vistas. La ARITMETICA de una vista para
 * toda la organizacion —que ya ninguna sesion ve entera— se comprueba leyendola
 * por la conexion de superusuario (`vistaCompleta`): prueba la cuenta, no quien
 * la ve.
 *
 * Reglas cubiertas: BR-F07, BR-F08, BR-F13, BR-U07, BR-Q04, BR-Q08 y CLAUDE.md
 * §23, §24.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DB_URL, loadSeedContext, signInAs, USERS, type Client } from './helpers'

let db: PgClient
let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let owner: Client
let admin: Client
let seller1: Client
let seller2: Client
let otherOrgOwner: Client
let otherOrgSeller: Client

beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  ctx = await loadSeedContext()
  owner = await signInAs(USERS.owner)
  admin = await signInAs(USERS.admin)
  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
  otherOrgOwner = await signInAs(USERS.otherOrgOwner)
  otherOrgSeller = await signInAs(USERS.otherOrgSeller)
})

afterAll(async () => {
  await db.end()
})

/** Primer valor de la primera fila de una consulta de control. */
async function control<T = number>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params)
  return Object.values(rows[0])[0] as T
}

/**
 * Suma una columna numerica de un conjunto de filas.
 *
 * Las filas llegan de dos sitios: de PostgREST, con los numeros ya como
 * `number`, y de `pg`, que entrega `bigint` y `numeric` como TEXTO. Se aceptan
 * los dos; cualquier otra cosa cuenta 0. Si alguien renombra una columna, la
 * suma da 0 y la prueba falla, que es justo lo que debe pasar.
 */
function sumar(filas: readonly Record<string, unknown>[] | null, campo: string): number {
  return (filas ?? []).reduce((acc, fila) => {
    const valor = fila[campo]
    if (typeof valor === 'number') return acc + valor
    if (typeof valor === 'string' && valor.trim() !== '' && Number.isFinite(Number(valor))) {
      return acc + Number(valor)
    }
    return acc
  }, 0)
}

/**
 * Una vista de la organizacion del seed, ENTERA, leida por fuera de la RLS.
 *
 * Desde D-198 ninguna sesion la ve completa: al personal no le suma nada y a
 * cada vendedor, lo suyo. Sirve para comprobar la aritmetica de la vista contra
 * su consulta de control; lo que ve cada persona se comprueba aparte, con su
 * sesion.
 */
async function vistaCompleta(
  vista: 'v_seller_summary' | 'v_raffle_summary' | 'v_client_balances',
  columnas = '*',
): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query(`select ${columnas} from ${vista} where organization_id = $1`, [
    ctx.demoOrg.id,
  ])
  return rows
}

// ===========================================================================
// F6-01 — Las metricas del panel administrativo cuadran con SQL
// ===========================================================================

describe('F6-01 metricas del panel administrativo (CLAUDE.md §23, D-198)', () => {
  it('los conteos de inventario coinciden con un conteo directo sobre tickets', async () => {
    const { data, error } = await owner.rpc('admin_ticket_inventory', {})
    expect(error).toBeNull()

    const suma = (campo: string) => sumar(data, campo)

    for (const estado of ['available', 'assigned', 'pending_approval', 'draft', 'cancelled']) {
      const esperado = await control(
        `select count(*)::int from tickets where organization_id = $1 and inventory_status = $2`,
        [ctx.demoOrg.id, estado],
      )
      expect(suma(`tickets_${estado}`), `estado ${estado}`).toBe(esperado)
    }

    const total = await control(`select count(*)::int from tickets where organization_id = $1`, [
      ctx.demoOrg.id,
    ])
    expect(suma('tickets_total')).toBe(total)
  })

  it('el personal cuenta dos estados de pago, y «Sin pagar» incluye las abonadas (BR-Q04)', async () => {
    const { data } = await owner.rpc('admin_ticket_inventory', {})
    const suma = (campo: string) => sumar(data, campo)

    const pagadas = await control(
      `select count(*)::int from tickets
       where organization_id = $1 and inventory_status = 'assigned' and payment_status = 'paid'`,
      [ctx.demoOrg.id],
    )
    const sinPagar = await control(
      `select count(*)::int from tickets
       where organization_id = $1 and inventory_status = 'assigned'
         and payment_status in ('unpaid', 'partial')`,
      [ctx.demoOrg.id],
    )
    const abonadas = await control(
      `select count(*)::int from tickets
       where organization_id = $1 and inventory_status = 'assigned' and payment_status = 'partial'`,
      [ctx.demoOrg.id],
    )

    expect(suma('tickets_paid')).toBe(pagadas)
    expect(suma('tickets_not_paid')).toBe(sinPagar)
    // Hay abonadas de verdad y van dentro de «Sin pagar»: la proyeccion no tiene
    // ninguna columna que diga cuantas son.
    expect(abonadas).toBeGreaterThan(0)
    for (const fila of data ?? []) {
      expect(fila).not.toHaveProperty('tickets_partial')
      expect(fila).not.toHaveProperty('tickets_unpaid')
    }
  })

  it('vendido, recaudado y saldo cuadran con la suma directa, y el personal no ve un peso', async () => {
    const { rows } = await db.query(
      `select coalesce(sum(sale_price), 0)::bigint  as vendido,
              coalesce(sum(paid_amount), 0)::bigint as recaudado,
              coalesce(sum(sale_price - paid_amount), 0)::bigint as saldo
       from tickets
       where organization_id = $1 and inventory_status = 'assigned'`,
      [ctx.demoOrg.id],
    )

    const filas = await vistaCompleta('v_seller_summary')
    expect(sumar(filas, 'total_sold')).toBe(Number(rows[0].vendido))
    expect(sumar(filas, 'total_collected')).toBe(Number(rows[0].recaudado))
    expect(sumar(filas, 'pending_amount')).toBe(Number(rows[0].saldo))
    expect(Number(rows[0].vendido)).toBeGreaterThan(0)

    for (const sesion of [owner, admin]) {
      const { data, error } = await sesion.from('v_seller_summary').select('*')
      expect(error).toBeNull()
      expect(sumar(data, 'total_sold')).toBe(0)
      expect(sumar(data, 'total_collected')).toBe(0)
      expect(sumar(data, 'pending_amount')).toBe(0)
    }
  })

  it('vendido menos recaudado es exactamente el saldo pendiente (BR-F08)', async () => {
    const filas = await vistaCompleta('v_seller_summary')
    expect(sumar(filas, 'total_sold')).toBeGreaterThan(0)
    expect(sumar(filas, 'total_sold') - sumar(filas, 'total_collected')).toBe(
      sumar(filas, 'pending_amount'),
    )

    // Y en la vista de un vendedor, con su sesion.
    const { data } = await seller1.from('v_seller_summary').select('*')
    expect(sumar(data, 'total_sold')).toBeGreaterThan(0)
    expect(sumar(data, 'total_sold') - sumar(data, 'total_collected')).toBe(
      sumar(data, 'pending_amount'),
    )
  })

  it('el recaudado es la suma de los pagos NO anulados, no de todos', async () => {
    const recaudado = sumar(
      await vistaCompleta('v_seller_summary', 'total_collected'),
      'total_collected',
    )

    const vigentes = await control<string>(
      `select coalesce(sum(pa.amount), 0)::bigint
       from payment_allocations pa
       join payments p on p.id = pa.payment_id
       where p.organization_id = $1 and p.voided_at is null`,
      [ctx.demoOrg.id],
    )
    const todos = await control<string>(
      `select coalesce(sum(pa.amount), 0)::bigint
       from payment_allocations pa
       join payments p on p.id = pa.payment_id
       where p.organization_id = $1`,
      [ctx.demoOrg.id],
    )

    expect(recaudado).toBe(Number(vigentes))
    // El seed incluye un pago anulado: si ambos numeros fueran iguales, esta
    // prueba no estaria demostrando nada.
    expect(Number(todos)).toBeGreaterThan(Number(vigentes))
  })

  it('el resumen por rifa cuadra con el resumen por vendedor', async () => {
    const [porRifa, porVendedor] = await Promise.all([
      vistaCompleta('v_raffle_summary', 'total_sold, total_collected, pending_amount'),
      vistaCompleta('v_seller_summary', 'total_sold, total_collected, pending_amount'),
    ])

    for (const campo of ['total_sold', 'total_collected', 'pending_amount']) {
      expect(sumar(porRifa, campo), campo).toBe(sumar(porVendedor, campo))
    }
    expect(sumar(porRifa, 'total_sold')).toBeGreaterThan(0)
  })

  it('el saldo por cliente suma exactamente el saldo por vendedor', async () => {
    // Es la premisa del reporte «Clientes con saldo»: el total del encabezado
    // sale del agregado por vendedor y la tabla lista clientes. Si ambos no
    // describieran el mismo dinero, el reporte se contradiria a si mismo.
    const [clientes, vendedores] = await Promise.all([
      vistaCompleta('v_client_balances', 'pending_amount'),
      vistaCompleta('v_seller_summary', 'pending_amount'),
    ])

    const sumaClientes = sumar(clientes, 'pending_amount')
    const sumaVendedores = sumar(vendedores, 'pending_amount')

    expect(sumaClientes).toBe(sumaVendedores)
    expect(sumaClientes).toBeGreaterThan(0)

    // El personal ya no ve ni un cliente con saldo (D-198).
    const { data: delDueno, error } = await owner.from('v_client_balances').select('client_id')
    expect(error).toBeNull()
    expect(delDueno).toEqual([])
  })
})

// ===========================================================================
// F6-02 — Metricas del dashboard del vendedor
// ===========================================================================

describe('F6-02 metricas del dashboard del vendedor (CLAUDE.md §23)', () => {
  it('un vendedor obtiene EXACTAMENTE sus propios numeros', async () => {
    const { data, error } = await seller1.from('v_seller_summary').select('*')
    expect(error).toBeNull()

    const suma = (campo: string) => sumar(data, campo)

    const { rows } = await db.query(
      `select count(*)::int as total,
              coalesce(sum(sale_price) filter (where inventory_status = 'assigned'), 0)::bigint as vendido,
              coalesce(sum(paid_amount) filter (where inventory_status = 'assigned'), 0)::bigint as recaudado
       from tickets where seller_id = $1`,
      [ctx.ids.seller1],
    )

    expect(suma('tickets_total')).toBe(rows[0].total)
    expect(suma('total_sold')).toBe(Number(rows[0].vendido))
    expect(suma('total_collected')).toBe(Number(rows[0].recaudado))
  })

  it('los numeros del vendedor son MENORES que los de la organizacion', async () => {
    // Si fueran iguales, el aislamiento podria estar roto y nadie lo notaria. El
    // total de la organizacion lo cuenta el personal, por su proyeccion (D-198).
    const [{ data: suyos }, { data: todos }] = await Promise.all([
      seller1.from('v_seller_summary').select('tickets_total'),
      owner.rpc('admin_ticket_inventory', {}),
    ])

    const deVendedor = sumar(suyos, 'tickets_total')
    const deOrganizacion = sumar(todos, 'tickets_total')

    expect(deVendedor).toBeGreaterThan(0)
    expect(deVendedor).toBeLessThan(deOrganizacion)
  })

  it('`v_raffle_summary` tambien se acota al vendedor que consulta', async () => {
    // La rifa es visible para todos, pero el JOIN con tickets hereda la RLS:
    // un vendedor ve la rifa con SUS conteos, no con los de la organizacion.
    const [{ data: suyo }, { data: delOwner }, deLaRifa] = await Promise.all([
      seller1
        .from('v_raffle_summary')
        .select('raffle_id, tickets_total')
        .eq('raffle_id', ctx.demoRaffle.id),
      owner
        .from('v_raffle_summary')
        .select('raffle_id, tickets_total')
        .eq('raffle_id', ctx.demoRaffle.id),
      control<number>(`select count(*)::int from tickets where raffle_id = $1`, [
        ctx.demoRaffle.id,
      ]),
    ])

    expect(suyo?.[0]?.tickets_total).toBeGreaterThan(0)
    expect(suyo![0]!.tickets_total!).toBeLessThan(deLaRifa)
    // Y al personal, desde D-198, no le cuenta ninguna.
    expect(sumar(delOwner, 'tickets_total')).toBe(0)
  })

  it('un vendedor solo ve a SUS clientes en el reporte de saldos', async () => {
    const { data } = await seller1.from('v_client_balances').select('client_id, seller_id')
    expect(data!.length).toBeGreaterThan(0)
    for (const row of data ?? []) {
      expect(row.seller_id).toBe(ctx.ids.seller1)
    }
  })
})

// ===========================================================================
// F6-03 — report_payment_totals / report_payments_by_day
// ===========================================================================

/**
 * Con la sesion de vendedor1, que es quien tiene pagos —el anulado del seed
 * incluido—, contra una consulta de control acotada a el. Hasta D-198 se pedian
 * con la del Dueño sobre la organizacion entera; ahora al personal le suman
 * cero, y lo comprueba la ultima prueba del bloque.
 */
describe('F6-03 funciones de reporte de pagos (0013)', () => {
  it('los totales coinciden con una suma directa sobre payments', async () => {
    const { data, error } = await seller1.rpc('report_payment_totals', {})
    expect(error).toBeNull()

    const { rows } = await db.query(
      `select count(*)::bigint as n,
              coalesce(sum(total_amount), 0)::bigint as total,
              count(*) filter (where voided_at is null)::bigint as vigentes,
              coalesce(sum(total_amount) filter (where voided_at is null), 0)::bigint as monto_vigente,
              count(*) filter (where voided_at is not null)::bigint as anulados,
              coalesce(sum(total_amount) filter (where voided_at is not null), 0)::bigint as monto_anulado
       from payments where seller_id = $1`,
      [ctx.ids.seller1],
    )

    const t = data![0]!
    expect(Number(t.payments_count)).toBe(Number(rows[0].n))
    expect(Number(t.total_amount)).toBe(Number(rows[0].total))
    expect(Number(t.active_count)).toBe(Number(rows[0].vigentes))
    expect(Number(t.active_amount)).toBe(Number(rows[0].monto_vigente))
    expect(Number(t.voided_count)).toBe(Number(rows[0].anulados))
    expect(Number(t.voided_amount)).toBe(Number(rows[0].monto_anulado))
    expect(Number(rows[0].n)).toBeGreaterThan(0)
  })

  it('el desglose diario suma exactamente el total', async () => {
    const [{ data: dias }, { data: totales }] = await Promise.all([
      seller1.rpc('report_payments_by_day', {}),
      seller1.rpc('report_payment_totals', {}),
    ])

    const sumaDias = (dias ?? []).reduce((acc, row) => acc + Number(row.total_amount ?? 0), 0)
    const sumaPagos = (dias ?? []).reduce((acc, row) => acc + Number(row.payments_count ?? 0), 0)

    expect(sumaDias).toBe(Number(totales![0]!.total_amount))
    expect(sumaPagos).toBe(Number(totales![0]!.payments_count))
    expect(sumaPagos).toBeGreaterThan(0)
  })

  it('separa lo vigente de lo anulado (BR-F09: el anulado no se borra, deja de contar)', async () => {
    const { data } = await seller1.rpc('report_payment_totals', {})
    const t = data![0]!

    expect(Number(t.voided_count)).toBeGreaterThan(0)
    expect(Number(t.active_amount) + Number(t.voided_amount)).toBe(Number(t.total_amount))
  })

  it('el filtro de estado devuelve subconjuntos coherentes', async () => {
    const [{ data: todos }, { data: vigentes }, { data: anulados }] = await Promise.all([
      seller1.rpc('report_payment_totals', {}),
      seller1.rpc('report_payment_totals', { p_status: 'active' }),
      seller1.rpc('report_payment_totals', { p_status: 'voided' }),
    ])

    expect(Number(vigentes![0]!.payments_count) + Number(anulados![0]!.payments_count)).toBe(
      Number(todos![0]!.payments_count),
    )
    expect(Number(vigentes![0]!.voided_amount)).toBe(0)
    expect(Number(anulados![0]!.active_amount)).toBe(0)
  })

  it('el filtro por metodo coincide con la consulta de control', async () => {
    const { data } = await seller1.rpc('report_payment_totals', { p_method: 'cash' })
    const esperado = await control<string>(
      `select coalesce(sum(total_amount), 0)::bigint from payments
       where seller_id = $1 and payment_method = 'cash'`,
      [ctx.ids.seller1],
    )
    expect(Number(data![0]!.total_amount)).toBe(Number(esperado))
    expect(Number(esperado)).toBeGreaterThan(0)
  })

  it('filtros COMBINADOS (metodo + estado + rango) se aplican todos a la vez', async () => {
    const hoy = await control<string>(
      `select max(payment_date)::text from payments where seller_id = $1`,
      [ctx.ids.seller1],
    )

    const { data } = await seller1.rpc('report_payment_totals', {
      p_method: 'cash',
      p_status: 'active',
      p_date_from: hoy,
      p_date_to: hoy,
    })
    const esperado = await control<string>(
      `select coalesce(sum(total_amount), 0)::bigint from payments
       where seller_id = $1 and payment_method = 'cash'
         and voided_at is null and payment_date = $2::date`,
      [ctx.ids.seller1, hoy],
    )

    expect(Number(data![0]!.total_amount)).toBe(Number(esperado))
    expect(Number(esperado)).toBeGreaterThan(0)
  })

  it('un rango sin pagos devuelve ceros, no filas vacias ni null', async () => {
    const { data, error } = await seller1.rpc('report_payment_totals', {
      p_date_from: '2000-01-01',
      p_date_to: '2000-12-31',
    })

    expect(error).toBeNull()
    expect(Number(data![0]!.payments_count)).toBe(0)
    expect(Number(data![0]!.total_amount)).toBe(0)
  })

  it('el desglose diario viene ordenado de mas reciente a mas antiguo', async () => {
    const { data } = await seller1.rpc('report_payments_by_day', {})
    const fechas = (data ?? []).map((row) => row.payment_date)
    expect(fechas.length).toBeGreaterThan(0)
    expect([...fechas].sort().reverse()).toEqual(fechas)
  })

  it('desde D-198 al personal no le suman ningun pago', async () => {
    const deLaOrganizacion = await control<string>(
      `select coalesce(sum(total_amount), 0)::bigint from payments where organization_id = $1`,
      [ctx.demoOrg.id],
    )
    expect(Number(deLaOrganizacion)).toBeGreaterThan(0)

    for (const sesion of [owner, admin]) {
      const [{ data: totales, error }, { data: dias, error: diasError }] = await Promise.all([
        sesion.rpc('report_payment_totals', {}),
        sesion.rpc('report_payments_by_day', {}),
      ])
      expect(error).toBeNull()
      expect(diasError).toBeNull()
      expect(Number(totales![0]!.payments_count)).toBe(0)
      expect(Number(totales![0]!.total_amount)).toBe(0)
      expect(dias).toEqual([])
    }
  })
})

// ===========================================================================
// F6-04 — Aislamiento de los reportes (CLAUDE.md §24)
// ===========================================================================

describe('F6-04 aislamiento de los reportes', () => {
  it('un vendedor solo agrega SUS pagos', async () => {
    const { data } = await seller1.rpc('report_payment_totals', {})
    const esperado = await control<string>(
      `select coalesce(sum(total_amount), 0)::bigint from payments where seller_id = $1`,
      [ctx.ids.seller1],
    )
    expect(Number(data![0]!.total_amount)).toBe(Number(esperado))
    expect(Number(esperado)).toBeGreaterThan(0)
  })

  it('un vendedor SIN pagos obtiene ceros, no los de su companero', async () => {
    const { data } = await seller2.rpc('report_payment_totals', {})
    expect(Number(data![0]!.payments_count)).toBe(0)
    expect(Number(data![0]!.total_amount)).toBe(0)
  })

  it('pedir el id de otro vendedor NO abre una puerta: la RLS decide', async () => {
    // `p_seller_id` fue una comodidad del portal administrativo, no un control
    // de seguridad. Si lo fuera, esta llamada devolveria los datos ajenos.
    const { data, error } = await seller2.rpc('report_payment_totals', {
      p_seller_id: ctx.ids.seller1,
    })
    expect(error).toBeNull()
    expect(Number(data![0]!.payments_count)).toBe(0)
    expect(Number(data![0]!.total_amount)).toBe(0)
  })

  it('una organizacion no ve el recaudo de otra', async () => {
    const { data } = await otherOrgSeller.rpc('report_payment_totals', {})
    const suyos = await control<string>(
      `select coalesce(sum(total_amount), 0)::bigint from payments where seller_id = $1`,
      [ctx.ids.otherOrgSeller],
    )
    expect(Number(data![0]!.total_amount)).toBe(Number(suyos))

    // Y el personal de esa organizacion, desde D-198, no suma ni lo suyo.
    const { data: delDueno } = await otherOrgOwner.rpc('report_payment_totals', {})
    expect(Number(delDueno![0]!.total_amount)).toBe(0)
  })

  it('el desglose diario de un vendedor sin pagos viene vacio', async () => {
    const { data } = await seller2.rpc('report_payments_by_day', {})
    expect(data).toEqual([])
  })

  it('el Administrador y el Dueño reciben lo mismo en los reportes: nada (D-198)', async () => {
    const [{ data: delOwner }, { data: delAdmin }] = await Promise.all([
      owner.rpc('report_payment_totals', {}),
      admin.rpc('report_payment_totals', {}),
    ])
    expect(delAdmin![0]).toEqual(delOwner![0])
    expect(Number(delOwner![0]!.total_amount)).toBe(0)
  })
})

// ===========================================================================
// F6-05 — Privilegios de las funciones nuevas
// ===========================================================================

describe('F6-05 privilegios de las funciones de reporte', () => {
  it('`authenticated` puede ejecutarlas', async () => {
    const { rows } = await db.query(`
      select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('report_payment_totals', 'report_payments_by_day')
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      order by p.proname
    `)
    expect(rows.map((r) => r.proname)).toEqual(['report_payment_totals', 'report_payments_by_day'])
  })

  it('`anon` NO puede ejecutarlas', async () => {
    const { rows } = await db.query(`
      select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('report_payment_totals', 'report_payments_by_day')
        and has_function_privilege('anon', p.oid, 'EXECUTE')
    `)
    expect(rows).toEqual([])
  })

  it('NO son SECURITY DEFINER: deben heredar la RLS de quien consulta', async () => {
    // Si alguien las convirtiera en definer, dejarian de aplicar
    // `payments_select` y un vendedor —o el personal— veria el recaudo de toda
    // la organizacion.
    const { rows } = await db.query(`
      select p.proname, p.prosecdef
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('report_payment_totals', 'report_payments_by_day')
      order by p.proname
    `)
    expect(rows.map((r) => r.prosecdef)).toEqual([false, false])
  })

  it('fijan search_path (docs/SECURITY.md §4.5, regla 1)', async () => {
    const { rows } = await db.query(`
      select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('report_payment_totals', 'report_payments_by_day')
        and (p.proconfig is null or not (array_to_string(p.proconfig, ',') like '%search_path%'))
    `)
    expect(rows).toEqual([])
  })

  it('devuelven dinero como bigint, no como numeric (D-040)', async () => {
    // `sum(bigint)` devuelve numeric en PostgreSQL, y PostgREST lo serializa
    // como STRING. Sin el cast, el frontend recibiria "290000" y sumarlo
    // concatenaria texto en vez de sumar pesos.
    const { data } = await seller1.rpc('report_payment_totals', {})
    expect(typeof data![0]!.total_amount).toBe('number')
    expect(typeof data![0]!.active_amount).toBe('number')

    const { data: dias } = await seller1.rpc('report_payments_by_day', {})
    expect(typeof dias![0]!.total_amount).toBe('number')
  })
})
