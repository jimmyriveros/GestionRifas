/**
 * Verificacion estructural del proyecto Supabase REAL.
 *
 * POR QUE EXISTE (I-020)
 *
 * `npm run test:db` comprueba las invariantes del esquema contra la instancia
 * LOCAL. Eso deja un punto ciego: un privilegio que Supabase concede de forma
 * distinta en el proyecto alojado hace que una invariante sea cierta en local y
 * falsa en produccion, sin que ninguna prueba lo note. Ya paso dos veces:
 *
 *   * Fase 2 (D-038): `authenticated` conservaba DELETE en el remoto -> 0010.
 *   * Fase 7 (I-020): `anon` podia ejecutar TODAS las funciones -> 0015.
 *
 * Este script ejecuta las mismas comprobaciones de catalogo contra el proyecto
 * real. Es de SOLO LECTURA: consulta `pg_catalog` e `information_schema`, no
 * toca datos ni estructura.
 *
 *   npm run verify:remote
 *
 * Necesita `SUPABASE_DB_URL` en `.env.local` (cadena del session pooler, I-005).
 */
import { config } from 'dotenv'
import { Client } from 'pg'

config({ path: '.env.local', quiet: true })

type Check = {
  nombre: string
  sql: string
  /** Numero de filas que debe devolver. Casi siempre 0. */
  esperado: number
}

const CHECKS: Check[] = [
  {
    nombre: 'Tablas sin RLS',
    sql: `select c.relname as x from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    esperado: 0,
  },
  {
    nombre: 'Tablas sin FORCE RLS',
    sql: `select c.relname as x from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relforcerowsecurity`,
    esperado: 0,
  },
  {
    nombre: 'Funciones SECURITY DEFINER sin search_path',
    sql: `select p.proname as x from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prosecdef
            and (p.proconfig is null or not (array_to_string(p.proconfig, ',') like '%search_path%'))`,
    esperado: 0,
  },
  {
    nombre: 'Vistas sin security_invoker',
    sql: `select c.relname as x from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'v'
            and (c.reloptions is null
                 or not (array_to_string(c.reloptions, ',') like '%security_invoker=true%'))`,
    esperado: 0,
  },
  {
    nombre: 'Politicas de DELETE',
    sql: `select policyname as x from pg_policies where schemaname = 'public' and cmd = 'DELETE'`,
    esperado: 0,
  },
  {
    nombre: 'DELETE o TRUNCATE concedido a authenticated',
    sql: `select table_name || ' ' || privilege_type as x from information_schema.role_table_grants
          where table_schema = 'public' and grantee = 'authenticated'
            and privilege_type in ('DELETE', 'TRUNCATE')`,
    esperado: 0,
  },
  {
    nombre: 'Privilegios de tabla para anon',
    sql: `select table_name as x from information_schema.role_table_grants
          where table_schema = 'public' and grantee = 'anon'`,
    esperado: 0,
  },
  {
    // La comprobacion que faltaba y que destapo I-020.
    nombre: 'Funciones PROPIAS ejecutables por anon',
    sql: `select p.proname as x
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and has_function_privilege('anon', p.oid, 'EXECUTE')
            and not exists (
              select 1 from pg_depend d join pg_extension e on e.oid = d.refobjid
              where d.objid = p.oid and d.deptype = 'e'
            )`,
    esperado: 0,
  },
  {
    // La comprobacion que faltaba y que destapo I-078.
    //
    // POR QUE NO BASTA CON MIRAR `anon`. Las funciones internas —disparadores,
    // ayudantes y el motor de comision— nunca deben poder llamarse desde una
    // SESION, y en el proyecto real 34 de ellas si podian: los privilegios por
    // defecto de `postgres` para las funciones de `public` incluyen ahi
    // `authenticated`, y en la pila local no. Es decir: **ninguna prueba local
    // podia verlo**, y por eso vivio desde la Fase 2.
    //
    // El criterio es «tiene EXECUTE para `authenticated` y NO deberia»:
    //
    //   * Se excluyen las funciones de extension (`pg_trgm`), que no son
    //     nuestras y no tocan datos.
    //   * Se excluye lo que la aplicacion SI debe poder llamar: la lista blanca
    //     de abajo son las 27 RPC del codigo mas las siete funciones que usan
    //     las POLITICAS de RLS —sin EXECUTE sobre ellas, toda lectura fallaria,
    //     porque la expresion de una politica se evalua como quien consulta—.
    //
    // Si esta comprobacion falla despues de anadir una funcion, la respuesta
    // correcta casi siempre es revocarla, no meterla en la lista. Solo entra
    // aqui lo que de verdad se llama desde el navegador o desde una politica.
    nombre: 'Funciones INTERNAS ejecutables por authenticated (I-078)',
    sql: `select p.proname as x
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.prokind = 'f'
            and has_function_privilege('authenticated', p.oid, 'EXECUTE')
            and not exists (
              select 1 from pg_depend d join pg_extension e on e.oid = d.refobjid
              where d.objid = p.oid and d.deptype = 'e'
            )
            and p.proname not in (
              -- Las RPC que llama la aplicacion
              'approve_tickets', 'bulk_assign_tickets', 'bulk_cancel_tickets',
              'bulk_change_ticket_seller', 'bulk_create_tickets', 'bulk_delete_tickets',
              'cancel_ticket', 'commission_summary', 'create_payment',
              'import_tickets_with_clients', 'log_ticket_import', 'mark_profile_activated',
              'report_payment_totals', 'report_payments_by_day', 'search_tickets',
              'taken_ticket_combinations', 'team_confirm_email_change', 'team_delete_member',
              'team_max_fixed_commission', 'team_member_sales', 'team_sales_summary',
              'team_set_commission_model', 'team_update_member', 'ticket_bulk_eligibility',
              'ticket_sale_price_limits', 'update_payment_allocation',
              'update_ticket_sale_price', 'void_payment',
              -- Usadas por las POLITICAS de RLS: sin EXECUTE no se lee nada
              'current_org_ids', 'current_profile_id', 'current_profile_leads_team',
              'current_staff_org_ids', 'current_team_seller_ids', 'has_org_role',
              'is_org_staff',
              -- Auxiliares que si se llaman desde la aplicacion o desde una
              -- columna generada, y no dan acceso a ningun dato
              'assign_ticket', 'format_cop', 'search_normalize',
              'match_ticket_import_clients', 'ticket_import_name_key', 'ticket_import_phone_key'
            )`,
    esperado: 0,
  },
  {
    nombre: 'Politicas que llaman a is_org_staff( por fila (I-019)',
    sql: `select tablename || '.' || policyname as x from pg_policies
          where schemaname = 'public'
            and (coalesce(qual, '') like '%is_org_staff(%'
                 or coalesce(with_check, '') like '%is_org_staff(%')`,
    esperado: 0,
  },
  {
    nombre: 'Columnas monetarias que no son bigint',
    sql: `select table_name || '.' || column_name as x from information_schema.columns
          where table_schema = 'public'
            and column_name in ('sale_price', 'paid_amount', 'total_amount', 'amount',
                                'ticket_price', 'total_sold', 'total_collected',
                                'pending_amount', 'total_purchased', 'total_paid')
            and data_type not in ('bigint', 'integer')`,
    esperado: 0,
  },
  {
    nombre: 'Las RPC de negocio son ejecutables por authenticated',
    sql: `select p.proname as x from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('create_payment', 'void_payment', 'update_payment_allocation',
                              'update_ticket_sale_price',
                              'assign_ticket', 'bulk_create_tickets', 'approve_tickets',
                              'cancel_ticket')
            and has_function_privilege('authenticated', p.oid, 'EXECUTE')`,
    esperado: 8,
  },
  {
    nombre: 'Las 2 funciones de reporte son ejecutables por authenticated',
    sql: `select p.proname as x from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('report_payment_totals', 'report_payments_by_day')
            and has_function_privilege('authenticated', p.oid, 'EXECUTE')`,
    esperado: 2,
  },
  {
    nombre: 'Las 5 vistas de saldos existen',
    sql: `select c.relname as x from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'v'`,
    esperado: 5,
  },
  {
    nombre: 'Tablas de loterias existen (0036, 0039)',
    sql: `select c.relname as x from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r'
            and c.relname in (
              'lottery_draw_schedules', 'lottery_results', 'lottery_ticket_matches',
              'lottery_sync_runs', 'lottery_sync_lock'
            )`,
    esperado: 5,
  },
  {
    nombre: 'RPC de loterias existen para service_role',
    sql: `select distinct p.proname as x
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in (
              'match_lottery_result', 'sync_lottery_schedules',
              'notify_lottery_schedule_changes', 'confirm_lottery_result',
              'try_acquire_lottery_sync_lock', 'release_lottery_sync_lock'
            )
            and has_function_privilege('service_role', p.oid, 'EXECUTE')`,
    esperado: 6,
  },
  {
    // I-078: el proyecto alojado concede EXECUTE a authenticated por defecto.
    // Las RPC de loterias son proceso interno (D-141, D-145, D-148).
    nombre: 'RPC de loterias SIN execute para authenticated',
    sql: `select p.proname as x
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in (
              'match_lottery_result', 'sync_lottery_schedules',
              'notify_lottery_schedule_changes', 'confirm_lottery_result',
              'try_acquire_lottery_sync_lock', 'release_lottery_sync_lock',
              'lottery_results_protect_confirmed', 'lottery_ticket_matches_immutable'
            )
            and has_function_privilege('authenticated', p.oid, 'EXECUTE')`,
    esperado: 0,
  },
]

async function main(): Promise<void> {
  const connectionString = process.env.SUPABASE_DB_URL
  if (!connectionString) {
    console.error('Falta SUPABASE_DB_URL en .env.local (cadena del session pooler, I-005).')
    process.exit(1)
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()

  console.log('Verificando el proyecto Supabase REAL (solo lectura)\n')

  let fallos = 0
  for (const check of CHECKS) {
    const { rows } = await client.query<{ x: string }>(check.sql)
    const ok = rows.length === check.esperado

    if (!ok) {
      fallos += 1
      console.log(`FALLA  ${check.nombre}: ${rows.length} (esperado ${check.esperado})`)
      for (const fila of rows.slice(0, 10)) console.log(`         · ${fila.x}`)
      if (rows.length > 10) console.log(`         · … y ${rows.length - 10} mas`)
    } else {
      console.log(`OK     ${check.nombre}`)
    }
  }

  await client.end()

  console.log(
    fallos === 0
      ? '\nTodas las verificaciones en verde.'
      : `\n${fallos} verificacion(es) fallida(s). Ver docs/KNOWN_ISSUES.md §4.`,
  )
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch((error: unknown) => {
  // Nunca se imprime la cadena de conexion: lleva la contrasena.
  console.error('Error al verificar:', error instanceof Error ? error.message : 'desconocido')
  process.exit(1)
})
