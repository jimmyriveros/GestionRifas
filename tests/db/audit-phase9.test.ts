/**
 * Pruebas de base de datos de la Fase 9 (auditoria final independiente).
 *
 * Cubren los dos hallazgos que la auditoria encontro probando el sistema, no
 * releyendolo: uno de producto (A-02) y uno de cobertura (A-03). Detalle
 * completo en `docs/AUDIT_REPORT.md`.
 *
 *   F9-01  A-02 — una organizacion no puede quedarse sin Owner activo.
 *   F9-02  A-03 — el aislamiento de pagos entre vendedores, en las DOS
 *          direcciones. Hasta la Fase 8 el seed dejaba a `vendedor2` sin ningun
 *          pago, asi que ninguna prueba comprobaba que los agregados de
 *          `vendedor1` EXCLUYERAN pagos ajenos: su total coincidia con el de la
 *          organizacion entera y esa igualdad no distingue «filtrado por
 *          vendedor» de «sin filtrar».
 *
 * Como todas las de este proyecto, operan con sesiones reales y clave publica.
 * `service_role` solo prepara datos, nunca comprueba RLS (D-043).
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

beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  ctx = await loadSeedContext()
  owner = await signInAs(USERS.owner)
  admin = await signInAs(USERS.admin)
  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
})

afterAll(async () => {
  await db.end()
})

/** Owners activos de una organizacion, leidos por fuera de la RLS. */
async function ownersActivos(orgId: string): Promise<number> {
  const { rows } = await db.query(
    `select count(*)::int as n from memberships
      where organization_id = $1 and role = 'owner' and is_active`,
    [orgId],
  )
  return rows[0].n as number
}

// ===========================================================================
// F9-01 — A-02: la organizacion conserva siempre un Owner activo
// ===========================================================================

describe('F9-01 una organizacion no puede quedarse sin Owner (A-02)', () => {
  it('el Owner NO puede degradarse a si mismo a vendedor', async () => {
    const antes = await ownersActivos(ctx.demoOrg.id)
    expect(antes).toBe(1)

    const { data, error } = await owner
      .from('memberships')
      .update({ role: 'seller' })
      .eq('profile_id', ctx.ids.owner)
      .eq('organization_id', ctx.demoOrg.id)
      .select('id')

    // Lo rechaza el trigger diferido de 0016, no la RLS: la politica sí deja
    // pasar la fila. Por eso llega como error de restriccion y no como 0 filas.
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/sin ningun Owner activo/i)
    expect(data).toBeNull()

    expect(await ownersActivos(ctx.demoOrg.id)).toBe(1)
  })

  it('el Owner NO puede desactivar su propia membresia', async () => {
    const { error } = await owner
      .from('memberships')
      .update({ is_active: false })
      .eq('profile_id', ctx.ids.owner)
      .eq('organization_id', ctx.demoOrg.id)
      .select('id')

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/sin ningun Owner activo/i)
    expect(await ownersActivos(ctx.demoOrg.id)).toBe(1)
  })

  it('un Admin sigue sin poder ascenderse a Owner (BR-U03)', async () => {
    const { error } = await admin
      .from('memberships')
      .update({ role: 'owner' })
      .eq('profile_id', ctx.ids.admin)
      .eq('organization_id', ctx.demoOrg.id)
      .select('id')

    // Aqui manda la RLS: la fila resultante seria un owner y quien llama no lo
    // es, asi que ni siquiera pasa el WITH CHECK.
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(await ownersActivos(ctx.demoOrg.id)).toBe(1)
  })

  it('el Owner SI puede cambiar el rol de otra persona: el trigger no estorba', async () => {
    const { data, error } = await owner
      .from('memberships')
      .update({ role: 'admin' })
      .eq('profile_id', ctx.ids.seller2)
      .eq('organization_id', ctx.demoOrg.id)
      .select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    // Restituir por base de datos, no por la interfaz: si esta prueba fallara a
    // medias, un `finally` en la propia prueba podria no llegar a ejecutarse
    // (docs/TESTING.md §3.1).
    await db.query(
      `update memberships set role = 'seller' where profile_id = $1 and organization_id = $2`,
      [ctx.ids.seller2, ctx.demoOrg.id],
    )
  })

  it('la transferencia de propiedad en UNA transaccion sigue siendo posible', async () => {
    // El trigger es DEFERRABLE INITIALLY DEFERRED justo para esto: el estado
    // intermedio con cero Owners existe dentro de la transaccion y solo se
    // valida al COMMIT. Sin diferirlo, transferir la propiedad seria imposible.
    await db.query('begin')
    try {
      await db.query(
        `update memberships set role = 'seller' where profile_id = $1 and organization_id = $2`,
        [ctx.ids.owner, ctx.demoOrg.id],
      )
      await db.query(
        `update memberships set role = 'owner' where profile_id = $1 and organization_id = $2`,
        [ctx.ids.admin, ctx.demoOrg.id],
      )
      await db.query('commit')
    } catch (error) {
      await db.query('rollback')
      throw error
    }

    expect(await ownersActivos(ctx.demoOrg.id)).toBe(1)

    // Devolver el seed a su estado original, en una sola transaccion tambien.
    await db.query('begin')
    await db.query(
      `update memberships set role = 'seller' where profile_id = $1 and organization_id = $2`,
      [ctx.ids.admin, ctx.demoOrg.id],
    )
    await db.query(
      `update memberships set role = 'owner' where profile_id = $1 and organization_id = $2`,
      [ctx.ids.owner, ctx.demoOrg.id],
    )
    await db.query(
      `update memberships set role = 'admin' where profile_id = $1 and organization_id = $2`,
      [ctx.ids.admin, ctx.demoOrg.id],
    )
    await db.query('commit')

    const { rows } = await db.query(
      `select role from memberships where profile_id = $1 and organization_id = $2`,
      [ctx.ids.owner, ctx.demoOrg.id],
    )
    expect(rows[0].role).toBe('owner')
  })

  it('la transaccion que deja la organizacion sin Owner se revierte entera', async () => {
    await db.query('begin')
    await db.query(
      `update memberships set role = 'seller' where profile_id = $1 and organization_id = $2`,
      [ctx.ids.owner, ctx.demoOrg.id],
    )
    // Hasta aqui todo bien: el trigger esta diferido. Falla al confirmar.
    await expect(db.query('commit')).rejects.toThrow(/sin ningun Owner activo/i)

    expect(await ownersActivos(ctx.demoOrg.id)).toBe(1)
  })
})

// ===========================================================================
// F9-02 — A-03: aislamiento de pagos entre vendedores, en las dos direcciones
// ===========================================================================

describe('F9-02 el aislamiento de pagos se cumple con datos en AMBOS vendedores (A-03)', () => {
  let pagoDeSeller2: string | null = null

  beforeAll(async () => {
    // El seed no le da ningun pago a `vendedor2`. Se le crea uno real, con su
    // propia sesion y por la RPC, para que la comparacion tenga sentido: sin
    // esto, «el total de vendedor1» y «el total de la organizacion» son el
    // mismo numero y la asercion no demuestra que haya filtrado por vendedor.
    const { data: boleta } = await ctx.svc
      .from('tickets')
      .select('id, client_id, sale_price, paid_amount')
      .eq('seller_id', ctx.ids.seller2)
      .eq('inventory_status', 'assigned')
      .limit(1)
      .single()

    const saldo = Number(boleta!.sale_price) - Number(boleta!.paid_amount)
    expect(saldo, 'la boleta elegida debe tener saldo pendiente').toBeGreaterThan(0)

    const monto = Math.min(7_777, saldo)
    const { data, error } = await seller2.rpc('create_payment', {
      p_client_id: boleta!.client_id!,
      p_total_amount: monto,
      p_allocations: [{ ticket_id: boleta!.id, amount: monto }],
    })
    expect(error).toBeNull()
    pagoDeSeller2 = data as unknown as string
  })

  afterAll(async () => {
    // El seed debe quedar EXACTAMENTE como estaba: otras pruebas —F6-04, entre
    // ellas— dan por hecho que `vendedor2` no tiene ningun pago, y anular no
    // basta: un pago anulado sigue apareciendo en `report_payments_by_day` con
    // su `voided_amount`. (Que esas pruebas dependan de eso es justo lo que
    // describe A-03.)
    //
    // Se borra de verdad, con la conexion de superusuario que estas pruebas ya
    // usan para leer la verdad de referencia. `DELETE` esta revocado para la
    // aplicacion (0010) precisamente para que esto solo sea posible aqui.
    //
    // Las dos sentencias van en UNA transaccion: borrar las asignaciones deja
    // el pago descuadrado, y el constraint trigger diferido lo rechazaria al
    // COMMIT. Borrando tambien el pago, `check_payment_balance` encuentra
    // `v_total is null` y no tiene nada que cuadrar — el caso que la propia
    // funcion contempla. Al borrar las asignaciones, `payment_allocations_recalc`
    // devuelve `tickets.paid_amount` a su valor original.
    if (!pagoDeSeller2) return

    await db.query('begin')
    try {
      await db.query('delete from payment_allocations where payment_id = $1', [pagoDeSeller2])
      await db.query('delete from payments where id = $1', [pagoDeSeller2])
      await db.query('commit')
    } catch (error) {
      await db.query('rollback')
      throw error
    }
  })

  it('ahora los dos vendedores tienen pagos: la comparacion es significativa', async () => {
    const { rows } = await db.query(
      `select seller_id, count(*)::int as n from payments group by seller_id`,
    )
    const conPagos = rows.filter((r) => Number(r.n) > 0).map((r) => r.seller_id)
    expect(conPagos).toContain(ctx.ids.seller1)
    expect(conPagos).toContain(ctx.ids.seller2)
  })

  it('en `payments`, ninguno ve una sola fila del otro', async () => {
    const [p1, p2] = await Promise.all([
      seller1.from('payments').select('id, seller_id'),
      seller2.from('payments').select('id, seller_id'),
    ])

    expect(p1.data!.length).toBeGreaterThan(0)
    expect(p2.data!.length).toBeGreaterThan(0)
    expect(p1.data!.filter((x) => x.seller_id !== ctx.ids.seller1)).toEqual([])
    expect(p2.data!.filter((x) => x.seller_id !== ctx.ids.seller2)).toEqual([])
  })

  it('en `payment_allocations`, ninguno alcanza las del otro', async () => {
    for (const [sesion, propio] of [
      [seller1, ctx.ids.seller1],
      [seller2, ctx.ids.seller2],
    ] as const) {
      const { data } = await sesion.from('payment_allocations').select('id')
      expect(data!.length).toBeGreaterThan(0)

      const { rows } = await db.query(
        `select count(*)::int as n from payment_allocations pa
           join payments p on p.id = pa.payment_id
          where pa.id = any($1::uuid[]) and p.seller_id <> $2`,
        [data!.map((r) => r.id), propio],
      )
      expect(rows[0].n, 'asignaciones ajenas visibles').toBe(0)
    }
  })

  it('en `v_payment_history`, ninguno ve el historial del otro', async () => {
    const [h1, h2] = await Promise.all([
      seller1.from('v_payment_history').select('payment_id, seller_id'),
      seller2.from('v_payment_history').select('payment_id, seller_id'),
    ])

    expect(h1.data!.filter((x) => x.seller_id !== ctx.ids.seller1)).toEqual([])
    expect(h2.data!.filter((x) => x.seller_id !== ctx.ids.seller2)).toEqual([])
  })

  it('`report_payment_totals` de cada uno coincide con SU verdad, no con la de la organizacion', async () => {
    const totalOrg = await db.query(
      `select count(*)::int as n, coalesce(sum(total_amount), 0)::bigint as s
         from payments where organization_id = $1`,
      [ctx.demoOrg.id],
    )

    for (const [sesion, id] of [
      [seller1, ctx.ids.seller1],
      [seller2, ctx.ids.seller2],
    ] as const) {
      const suyo = await db.query(
        `select count(*)::int as n, coalesce(sum(total_amount), 0)::bigint as s
           from payments where seller_id = $1`,
        [id],
      )
      const { data, error } = await sesion.rpc('report_payment_totals', {})
      expect(error).toBeNull()

      expect(Number(data![0]!.payments_count)).toBe(Number(suyo.rows[0].n))
      expect(Number(data![0]!.total_amount)).toBe(Number(suyo.rows[0].s))
      // Lo que faltaba antes: el total propio es ESTRICTAMENTE menor que el de
      // la organizacion. Si la funcion dejara de filtrar, esto fallaria.
      expect(Number(data![0]!.total_amount)).toBeLessThan(Number(totalOrg.rows[0].s))
    }
  })

  it('el Owner sigue viendo el total completo de la organizacion', async () => {
    const totalOrg = await db.query(
      `select coalesce(sum(total_amount), 0)::bigint as s from payments where organization_id = $1`,
      [ctx.demoOrg.id],
    )
    const { data } = await owner.rpc('report_payment_totals', {})
    expect(Number(data![0]!.total_amount)).toBe(Number(totalOrg.rows[0].s))
  })
})
