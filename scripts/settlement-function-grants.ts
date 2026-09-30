/**
 * Quién ejecuta cada función del cierre de cuentas (D-241, migración `0080`).
 * Mismo patrón y mismo motivo que `prize-function-grants.ts` (D-207, I-132): en
 * el proyecto alojado toda función nueva de `public` nace ejecutable por
 * `service_role`, en la pila local no, y ninguna prueba local lo vería.
 *
 * Aquí vive la lista EXACTA, una sola vez. La usan la `0080` (que se comprueba a
 * sí misma al aplicarse), `scripts/verify-remote.ts` (contra el proyecto real) y
 * `tests/db/settlements.test.ts`. Cambiar quién ejecuta una de estas funciones
 * es cambiar este archivo, una migración nueva y las tres cosas a la vez.
 */
import {
  executeMatrixSql,
  unclassifiedOverloadsSql,
  type ExecuteMatrix,
  type RemoteCheck,
} from './prize-function-grants'

/**
 * Las RPC de una sesión. Autorizan DENTRO: las del personal por la capacidad
 * `settlements.manage`; las del vendedor por ser vendedor activo de la
 * organización o el vendedor a cargo de la cuenta; y las escrituras, por ser
 * quien recibe el dinero (BR-Z05, BR-Z07).
 */
export const SETTLEMENT_SESSION_RPCS = [
  'settlement_record_transfer(uuid,uuid,settlement_transfer_kind,bigint,date,bigint,uuid)',
  'settlement_record_prize_payment(uuid,uuid,uuid,settlement_prize_payer,date,uuid,uuid,bigint)',
  'settlement_void_transfer(uuid,text)',
  'settlement_void_prize_payment(uuid,text)',
  'settlement_confirm_close(uuid,uuid,text)',
  'staff_settlement_overview(uuid)',
  'staff_settlement_accounts(uuid,text,text,integer,integer)',
  'staff_settlement_account(uuid,uuid)',
  'staff_settlement_prizes(uuid,uuid)',
  'staff_settlement_transfers(uuid,uuid)',
  'seller_settlement_account(uuid,uuid)',
  'seller_settlement_team(uuid)',
  'seller_settlement_prizes(uuid,uuid)',
  'seller_settlement_transfers(uuid,uuid)',
] as const

/** Lo que no ejecuta NADIE directamente: lo usan las funciones que lo llaman. */
export const SETTLEMENT_INTERNAL_FUNCTIONS = [
  'settlement_rows_guard()',
  'settlement_seller_figures(uuid,uuid)',
  'settlement_account_rows(uuid,uuid)',
  'settlement_award_rows(uuid,uuid)',
  'settlement_lock(uuid,uuid)',
  'settlement_payer_problem(uuid,uuid,uuid,settlement_prize_payer,uuid)',
  'settlement_try_close(uuid,uuid,uuid,uuid,settlement_close_cause,uuid)',
] as const

/** Las funciones de la `0080` con su EXECUTE efectivo esperado. */
export const SETTLEMENT_FUNCTION_GRANTS: ReadonlyArray<{
  signature: string
  expected: ExecuteMatrix
}> = [
  ...SETTLEMENT_SESSION_RPCS.map((signature) => ({
    signature,
    expected: { public: false, anon: false, authenticated: true, service_role: false },
  })),
  ...SETTLEMENT_INTERNAL_FUNCTIONS.map((signature) => ({
    signature,
    expected: { public: false, anon: false, authenticated: false, service_role: false },
  })),
]

/** Las tres tablas: RLS forzada, sin políticas y sin privilegios para una sesión. */
export const SETTLEMENT_TABLES = [
  'settlement_transfers',
  'settlement_prize_payments',
  'settlement_closings',
] as const

const lista = (valores: readonly string[]) => valores.map((v) => `'${v}'`).join(', ')

/**
 * Las comprobaciones de la `0080` que corre `npm run verify:remote`. Las mismas
 * que ejecuta la prueba de base de datos contra la pila local. Fallan contra el
 * proyecto real hasta que la `0080` se aplique.
 */
export const SETTLEMENT_FUNCTION_CHECKS: RemoteCheck[] = [
  {
    nombre: 'Funciones del cierre de cuentas con EXECUTE distinto de la lista blanca exacta (0080)',
    sql: executeMatrixSql(SETTLEMENT_FUNCTION_GRANTS),
    esperado: 0,
  },
  {
    nombre: 'Funciones del cierre de cuentas sin clasificar en la lista blanca (0080)',
    sql: unclassifiedOverloadsSql(SETTLEMENT_FUNCTION_GRANTS),
    esperado: 0,
  },
  {
    // BR-Z13: ninguna sesión lee ni escribe una fila directamente. Una tabla que
    // falte cuenta como diferencia: la comprobación no puede pasar por no existir.
    nombre: 'Tablas del cierre de cuentas con acceso directo para una sesión (0080)',
    sql: `select t.nombre as x
            from unnest(array[${lista(SETTLEMENT_TABLES)}]) as t(nombre)
            left join pg_class c
              on c.relname = t.nombre and c.relnamespace = 'public'::regnamespace
           where c.oid is null
              or not c.relrowsecurity
              or not c.relforcerowsecurity
              or exists (select 1 from pg_policies p
                          where p.schemaname = 'public' and p.tablename = t.nombre)
              or has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
              or has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')`,
    esperado: 0,
  },
  {
    // D-241: el Dueño y el Administrador reciben la capacidad; el vendedor no.
    nombre: 'La capacidad settlements.manage, como se describe (0080)',
    sql: `select 'catalogo' as x where not ('settlements.manage' = any (app_capability_catalog()))
          union all
          select 'administrador' where not ('settlements.manage' = any (app_role_default_capabilities('admin')))
          union all
          select 'vendedor' where 'settlements.manage' = any (app_role_default_capabilities('seller'))`,
    esperado: 0,
  },
]
