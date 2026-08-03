/**
 * Verificaciones estructurales sobre el catalogo de PostgreSQL
 * (docs/TESTING.md §4, docs/KNOWN_ISSUES.md R-03 y R-04).
 *
 * Estas pruebas no comprueban un caso concreto, sino una INVARIANTE del
 * esquema: que no exista NINGUNA tabla sin RLS, NINGUNA funcion privilegiada
 * sin search_path fijo y NINGUNA vista sin security_invoker. Su valor esta en
 * las fases futuras: si alguien agrega manana una tabla o una vista y olvida
 * asegurarla, estas pruebas fallan aunque nadie escriba una prueba nueva.
 *
 * Es tambien un punto obligatorio de la auditoria de la Fase 9.
 */
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { DB_URL } from './helpers'

let db: Client

beforeAll(async () => {
  db = new Client({ connectionString: DB_URL })
  await db.connect()
})

afterAll(async () => {
  await db.end()
})

describe('RLS habilitada y forzada en todas las tablas de negocio', () => {
  it('ninguna tabla del esquema public queda sin RLS', async () => {
    const { rows } = await db.query(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and not c.relrowsecurity
      order by c.relname
    `)
    expect(rows.map((r) => r.relname)).toEqual([])
  })

  it('todas usan FORCE ROW LEVEL SECURITY (aplica tambien al dueno de la tabla)', async () => {
    const { rows } = await db.query(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and not c.relforcerowsecurity
      order by c.relname
    `)
    expect(rows.map((r) => r.relname)).toEqual([])
  })

  it('las 9 tablas de negocio existen y tienen politicas', async () => {
    const { rows } = await db.query(`
      select tablename, count(*)::int as policies
      from pg_policies where schemaname = 'public'
      group by tablename order by tablename
    `)
    const conPoliticas = rows.map((r) => r.tablename)
    for (const t of [
      'audit_logs',
      'clients',
      'memberships',
      'organizations',
      'payment_allocations',
      'payments',
      'profiles',
      'raffles',
      'tickets',
    ]) {
      expect(conPoliticas, `${t} sin politicas`).toContain(t)
    }
  })

  it('ninguna tabla concede DELETE ni TRUNCATE a authenticated (0009, 0010)', async () => {
    const { rows } = await db.query(`
      select table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee = 'authenticated'
        and privilege_type in ('DELETE', 'TRUNCATE')
      order by table_name, privilege_type
    `)
    expect(rows).toEqual([])
  })

  it('anon no tiene ningun privilegio sobre las tablas de negocio (0010)', async () => {
    const { rows } = await db.query(`
      select table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon'
      order by table_name, privilege_type
    `)
    expect(rows).toEqual([])
  })

  it('no existe ninguna politica de DELETE', async () => {
    const { rows } = await db.query(`
      select tablename, policyname from pg_policies
      where schemaname = 'public' and cmd = 'DELETE'
    `)
    expect(rows).toEqual([])
  })
})

describe('funciones privilegiadas', () => {
  it('toda funcion SECURITY DEFINER fija search_path (riesgo R-04)', async () => {
    const { rows } = await db.query(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and (p.proconfig is null or not (array_to_string(p.proconfig, ',') like '%search_path%'))
      order by p.proname
    `)
    expect(rows.map((r) => r.proname)).toEqual([])
  })

  it('las RPC de negocio no son ejecutables por PUBLIC ni por anon', async () => {
    const { rows } = await db.query(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('create_payment','void_payment','assign_ticket',
                          'bulk_create_tickets','approve_tickets','cancel_ticket')
        and (has_function_privilege('anon', p.oid, 'EXECUTE'))
      order by p.proname
    `)
    expect(rows.map((r) => r.proname)).toEqual([])
  })

  it('las RPC de negocio SI son ejecutables por authenticated', async () => {
    const { rows } = await db.query(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('create_payment','void_payment','assign_ticket',
                          'bulk_create_tickets','approve_tickets','cancel_ticket')
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      order by p.proname
    `)
    expect(rows.length).toBe(6)
  })
})

describe('vistas', () => {
  it('toda vista usa security_invoker = true (riesgo R-03, D-010)', async () => {
    const { rows } = await db.query(`
      select c.relname, c.reloptions
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'v'
        and (c.reloptions is null
             or not (array_to_string(c.reloptions, ',') like '%security_invoker=true%'))
      order by c.relname
    `)
    expect(rows.map((r) => r.relname)).toEqual([])
  })

  it('las 5 vistas de saldos existen', async () => {
    const { rows } = await db.query(`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v' order by c.relname
    `)
    expect(rows.map((r) => r.relname)).toEqual([
      'v_client_balances',
      'v_payment_history',
      'v_raffle_summary',
      'v_seller_summary',
      'v_ticket_balances',
    ])
  })
})

describe('auditoria sin ciclos', () => {
  it('audit_logs no tiene triggers propios (imposible la recursion)', async () => {
    const { rows } = await db.query(`
      select tgname from pg_trigger
      where tgrelid = 'public.audit_logs'::regclass and not tgisinternal
    `)
    expect(rows).toEqual([])
  })

  it('la bitacora registro las acciones criticas del seed (BR-D01)', async () => {
    const { rows } = await db.query(`select distinct action from audit_logs order by action`)
    const acciones = rows.map((r) => r.action)
    for (const esperada of [
      'client.create',
      'membership.create',
      'payment.create',
      'payment.void',
      'raffle.create',
      'ticket.assign_client',
      'ticket.create',
    ]) {
      expect(acciones, `falta ${esperada}`).toContain(esperada)
    }
  })

  it('no registra ruido de contadores internos ni de columnas derivadas', async () => {
    // Crear boletas incrementa raffles.ticket_counter una vez por boleta; sin el
    // filtro de 0006 la bitacora se llenaria de "raffle.update" sin valor.
    const { rows } = await db.query(`
      select count(*)::int as n from audit_logs
      where action = 'raffle.update'
        and (new_values ? 'ticket_counter' or new_values ? 'raffle_counter')
    `)
    expect(rows[0].n).toBe(0)

    const { rows: derivadas } = await db.query(`
      select count(*)::int as n from audit_logs
      where new_values ? 'paid_amount' and action = 'ticket.update'
    `)
    expect(derivadas[0].n).toBe(0)
  })
})

describe('DB-15 estrategia de reversion documentada', () => {
  it('cada migracion incluye su nota de reversion', async () => {
    const dir = join(process.cwd(), 'supabase', 'migrations')
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql'))
    expect(files.length).toBeGreaterThanOrEqual(9)

    for (const file of files) {
      const sql = readFileSync(join(dir, file), 'utf8')
      expect(sql, `${file} sin nota de reversion`).toMatch(/Nota de reversion/i)
    }
  })
})

describe('integridad del dinero', () => {
  // Exige bigint/integer, no solo "no float". `sum(bigint)` devuelve `numeric`
  // en PostgreSQL: es exacto, pero PostgREST lo serializa distinto que un
  // bigint, y esa inconsistencia entre tablas y vistas terminaria en errores
  // de dinero en el frontend. Por eso las vistas castean a bigint (0008).
  it('toda columna monetaria es bigint, tambien en las vistas (BR-P02)', async () => {
    const { rows } = await db.query(`
      select table_name, column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
        and (column_name like '%amount%' or column_name like '%price%')
        and data_type not in ('bigint', 'integer')
      order by table_name, column_name
    `)
    expect(rows).toEqual([])
  })

  it('todo pago cuadra exactamente con sus asignaciones (BR-F05)', async () => {
    const { rows } = await db.query(`
      select p.id
      from payments p
      left join payment_allocations pa on pa.payment_id = p.id
      group by p.id, p.total_amount
      having coalesce(sum(pa.amount), 0) <> p.total_amount
    `)
    expect(rows).toEqual([])
  })

  it('ninguna boleta esta sobrepagada (BR-F12)', async () => {
    const { rows } = await db.query(`
      select id, paid_amount, sale_price from tickets
      where sale_price is not null and paid_amount > sale_price
    `)
    expect(rows).toEqual([])
  })

  it('paid_amount coincide con la suma real de pagos no anulados (BR-F07)', async () => {
    const { rows } = await db.query(`
      select t.id, t.paid_amount, coalesce(sum(pa.amount), 0) as real
      from tickets t
      left join payment_allocations pa on pa.ticket_id = t.id
      left join payments p on p.id = pa.payment_id and p.voided_at is null
      group by t.id, t.paid_amount
      having t.paid_amount <> coalesce(sum(case when p.id is not null then pa.amount else 0 end), 0)
    `)
    expect(rows).toEqual([])
  })
})
