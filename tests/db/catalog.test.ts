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

  it('las tablas de negocio con lectura autenticada tienen politicas', async () => {
    const { rows } = await db.query(`
      select tablename, count(*)::int as policies
      from pg_policies where schemaname = 'public'
      group by tablename order by tablename
    `)
    const conPoliticas = rows.map((r) => r.tablename)
    for (const t of [
      'audit_logs',
      'clients',
      'lottery_draw_schedules',
      'lottery_results',
      'lottery_ticket_matches',
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
                          'bulk_create_tickets','approve_tickets','cancel_ticket',
                          'match_ticket_import_clients','import_tickets_with_clients')
        and (has_function_privilege('anon', p.oid, 'EXECUTE'))
      order by p.proname
    `)
    expect(rows.map((r) => r.proname)).toEqual([])
  })

  /**
   * I-020: la comprobacion de arriba mira SOLO seis funciones por nombre. En el
   * proyecto real, `anon` podia ejecutar TODAS las demas —incluidas las
   * SECURITY DEFINER de seguridad— porque los GRANT por defecto de Supabase van
   * directos al rol y `revoke ... from public` no los deshace.
   *
   * Esta version cubre cualquier funcion propia, tambien las que se escriban
   * manana. Se excluyen las de extensiones (pg_trgm), que las llama la
   * maquinaria de indices y no el usuario.
   */
  it('NINGUNA funcion propia es ejecutable por anon (I-020)', async () => {
    const { rows } = await db.query(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and has_function_privilege('anon', p.oid, 'EXECUTE')
        and not exists (
          select 1 from pg_depend d
          join pg_extension e on e.oid = d.refobjid
          where d.objid = p.oid and d.deptype = 'e'
        )
      order by p.proname
    `)
    expect(rows.map((r) => r.proname)).toEqual([])
  })

  /**
   * La gemela de la anterior, para `authenticated` (I-078, D-128).
   *
   * ⚠️ ESTA PRUEBA PASABA ANTES DE EXISTIR EL PROBLEMA Y SEGUIRA PASANDO SI
   * VUELVE. No es un fallo suyo: es que **en local nunca ocurrio**. Los
   * privilegios por defecto de `postgres` para las funciones de `public` son
   * distintos en los dos entornos —en el proyecto real incluyen
   * `authenticated`, en la pila local no—, asi que 34 funciones internas
   * llevaban desde la Fase 2 siendo ejecutables desde una sesion **solo en
   * produccion**, y ninguna prueba de aqui podia verlo.
   *
   * Se mantiene igualmente por dos razones: fija la lista blanca en un sitio
   * que se lee al cambiarla, y detecta el caso contrario —que alguien conceda
   * a mano una funcion interna en una migracion—, que si viajaria a local.
   *
   * **La comprobacion que de verdad cierra I-078 es la de
   * `scripts/verify-remote.ts`**, porque es la unica que mira el proyecto real.
   * Si tocas la lista blanca, cambiala en los DOS sitios.
   */
  it('NINGUNA funcion interna es ejecutable por authenticated (I-078)', async () => {
    const PUBLICAS = [
      // Las RPC que llama la aplicacion
      'approve_tickets',
      'bulk_assign_tickets',
      'bulk_cancel_tickets',
      'bulk_change_ticket_seller',
      'bulk_create_tickets',
      'bulk_delete_tickets',
      'cancel_ticket',
      'commission_summary',
      'create_payment',
      'import_tickets_with_clients',
      'log_ticket_import',
      'mark_profile_activated',
      'reassign_ticket_client',
      'release_ticket_client',
      'report_payment_totals',
      'report_payments_by_day',
      'report_sales_totals',
      'search_tickets',
      'set_ticket_clearance_delivery',
      'taken_ticket_combinations',
      'team_confirm_email_change',
      'team_delete_member',
      'team_max_fixed_commission',
      'team_member_sales',
      'team_sales_summary',
      'team_set_commission_model',
      'team_update_member',
      'ticket_bulk_eligibility',
      'ticket_sale_price_limits',
      'update_payment_allocation',
      'update_ticket_sale_price',
      'void_payment',
      // Usadas por las POLITICAS de RLS: sin EXECUTE no se lee nada
      'current_org_ids',
      'current_profile_id',
      'current_profile_leads_team',
      'current_staff_org_ids',
      'current_team_seller_ids',
      'has_org_role',
      'is_org_staff',
      // Auxiliares llamadas desde la aplicacion o desde una columna generada
      'assign_ticket',
      'format_cop',
      'search_normalize',
      'match_ticket_import_clients',
      'ticket_import_name_key',
      'ticket_import_phone_key',
    ]

    const { rows } = await db.query(
      `select p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prokind = 'f'
          and has_function_privilege('authenticated', p.oid, 'EXECUTE')
          and not exists (
            select 1 from pg_depend d
            join pg_extension e on e.oid = d.refobjid
            where d.objid = p.oid and d.deptype = 'e'
          )
          and p.proname <> all ($1)
        order by p.proname`,
      [PUBLICAS],
    )
    expect(rows.map((r) => r.proname)).toEqual([])
  })

  it('las RPC de negocio SI son ejecutables por authenticated', async () => {
    const { rows } = await db.query(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('create_payment','void_payment','update_payment_allocation',
                          'update_ticket_sale_price','reassign_ticket_client',
                          'release_ticket_client','set_ticket_clearance_delivery',
                          'assign_ticket','bulk_create_tickets','approve_tickets','cancel_ticket',
                          'match_ticket_import_clients','import_tickets_with_clients')
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      order by p.proname
    `)
    expect(rows.length).toBe(13)
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
