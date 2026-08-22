/**
 * Migracion 0030 — indices de lectura y vistas reescritas (D-102).
 *
 * Estas pruebas no miden tiempos: un banco de pruebas de rendimiento sobre la
 * base del seed —treinta boletas— no diria nada, y las medidas reales estan en
 * `docs/TEST_RESULTS.md`. Lo que se comprueba aqui es lo que SI puede romperse
 * sin que nadie se entere:
 *
 *   1. Que los seis indices sigan existiendo con la definicion que los hace
 *      utiles. Media migracion es un indice parcial cuya condicion es lo unico
 *      que permite al planificador usarlo para ordenar; si alguien la quita al
 *      «limpiar», el indice sigue ahi y la pantalla vuelve a tardar un segundo
 *      sin ningun sintoma visible.
 *   2. Que las dos vistas reescritas devuelvan EXACTAMENTE lo mismo que la
 *      formulacion anterior. Esa es la promesa de la migracion.
 *   3. Que sigan siendo `security_invoker`: `create or replace view` no conserva
 *      las opciones, y perderlo dejaria las dos vistas leyendo sin RLS.
 */
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DB_URL, loadSeedContext, signInAs, USERS } from './helpers'

let db: Client

beforeAll(async () => {
  db = new Client({ connectionString: DB_URL })
  await db.connect()
})

afterAll(async () => {
  await db.end()
})

describe('0030 — indices que sostienen las pantallas mas usadas', () => {
  const esperados: Record<string, RegExp> = {
    // Orden por defecto del listado de boletas.
    tickets_created_at_idx: /\(created_at DESC\)$/,
    // Ventas recientes. La condicion parcial es lo que permite el recorrido
    // ordenado; sin ella el planificador vuelve al mapa de bits y ordena.
    tickets_assigned_at_idx: /\(assigned_at DESC\) WHERE \(inventory_status = 'assigned'/,
    // Historial de pagos, incluidos los anulados (por eso NO es parcial).
    payments_date_created_idx: /\(payment_date DESC, created_at DESC\)$/,
    // Cartera activa por orden alfabetico y por antigüedad.
    clients_name_active_idx: /\(name\) WHERE \(archived_at IS NULL\)/,
    clients_created_at_idx: /\(created_at DESC\) WHERE \(archived_at IS NULL\)/,
    // Recuento de comision, que corre en cada abono.
    tickets_commission_count_idx:
      /\(seller_id, raffle_id, payment_status\) WHERE \(inventory_status = 'assigned'/,
  }

  it('los seis existen con la definicion que los hace utiles', async () => {
    const { rows } = await db.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
       where schemaname = 'public' and indexname = any($1)`,
      [Object.keys(esperados)],
    )

    const porNombre = new Map(rows.map((row) => [row.indexname, row.indexdef]))

    for (const [nombre, patron] of Object.entries(esperados)) {
      const definicion = porNombre.get(nombre)
      expect(definicion, `falta el indice ${nombre}`).toBeDefined()
      expect(definicion, `${nombre} cambio de definicion`).toMatch(patron)
    }
  })
})

describe('0030 — las vistas reescritas devuelven lo mismo que antes', () => {
  it('v_client_balances coincide fila a fila con la formulacion con group by', async () => {
    const { rows } = await db.query<{ distintas: string }>(`
      with vieja as (
        select
          c.id as client_id,
          count(t.id) filter (where t.inventory_status = 'assigned') as tickets_count,
          coalesce(sum(t.sale_price)  filter (where t.inventory_status = 'assigned'), 0)::bigint as total_purchased,
          coalesce(sum(t.paid_amount) filter (where t.inventory_status = 'assigned'), 0)::bigint as total_paid,
          coalesce(sum(t.sale_price - t.paid_amount)
                     filter (where t.inventory_status = 'assigned'), 0)::bigint as pending_amount
        from clients c
        left join tickets t on t.client_id = c.id
        group by c.id
      )
      select count(*)::text as distintas
      from vieja v
      full join v_client_balances n on n.client_id = v.client_id
      where v.client_id      is distinct from n.client_id
         or v.tickets_count  is distinct from n.tickets_count
         or v.total_purchased is distinct from n.total_purchased
         or v.total_paid     is distinct from n.total_paid
         or v.pending_amount is distinct from n.pending_amount
    `)

    expect(rows[0]?.distintas).toBe('0')
  })

  it('v_client_balances cuenta todos los clientes, tambien los que no tienen boletas', async () => {
    const { rows } = await db.query<{ clientes: string; filas: string }>(`
      select (select count(*)::text from clients)            as clientes,
             (select count(*)::text from v_client_balances)  as filas
    `)

    expect(rows[0]?.filas).toBe(rows[0]?.clientes)
  })

  it('v_payment_history no pierde ningun pago al cruzar con el cliente', async () => {
    const { rows } = await db.query<{ pagos: string; filas: string }>(`
      select (select count(*)::text from payments)           as pagos,
             (select count(*)::text from v_payment_history)  as filas
    `)

    expect(rows[0]?.filas).toBe(rows[0]?.pagos)
  })

  it('las dos siguen ejecutandose con los permisos de quien consulta', async () => {
    const { rows } = await db.query<{ relname: string; opciones: string[] | null }>(`
      select c.relname, c.reloptions as opciones
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('v_client_balances', 'v_payment_history')
      order by c.relname
    `)

    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.opciones, `${row.relname} perdio security_invoker`).toContain(
        'security_invoker=true',
      )
    }
  })
})

describe('0030 — el aislamiento no cambia con las vistas nuevas', () => {
  it('un vendedor sigue viendo solo la cartera y los pagos suyos', async () => {
    const { ids } = await loadSeedContext()
    const seller = await signInAs(USERS.seller1)

    const { data: balances } = await seller.from('v_client_balances').select('client_id, seller_id')
    expect(balances?.length).toBeGreaterThan(0)
    expect(balances?.every((row) => row.seller_id === ids.seller1)).toBe(true)

    const { data: pagos } = await seller.from('v_payment_history').select('payment_id, seller_id')
    expect(pagos?.every((row) => row.seller_id === ids.seller1)).toBe(true)
  })
})
