/**
 * Quién ejecuta cada función de la configuración de ganancias (D-237, migración
 * `0078`). Mismo patrón y mismo motivo que `prize-function-grants.ts` (D-207,
 * I-132): en el proyecto alojado toda función nueva de `public` nace ejecutable
 * por `service_role`, en la pila local no, y ninguna prueba local lo vería.
 *
 * Aquí vive la lista EXACTA, una sola vez. La usan la `0078` (que la escribe en
 * SQL y se comprueba a sí misma al aplicarse), `scripts/verify-remote.ts`
 * (contra el proyecto real) y `tests/db/earning-agreements.test.ts`. Cambiar
 * quién ejecuta una de estas funciones es cambiar este archivo, una migración
 * nueva y las tres cosas a la vez.
 */
import {
  executeMatrixSql,
  unclassifiedOverloadsSql,
  type ExecuteMatrix,
  type RemoteCheck,
} from './prize-function-grants'

/**
 * Las RPC de una sesión. Las tres del personal autorizan por la capacidad
 * `sellers.earnings.manage`; la del padre, por `current_profile_leads_team`; y
 * `commission_summary` es de invocador y hereda la RLS.
 */
export const EARNING_SESSION_RPCS = [
  'save_commission_template(uuid,jsonb)',
  'staff_create_seller_membership(uuid,uuid,commission_agreement_mode,bigint,jsonb)',
  'staff_set_seller_agreement(uuid,commission_agreement_mode,bigint,jsonb)',
  'team_set_commission_model(uuid,commission_model,bigint)',
  'team_commission_limits(uuid)',
  'commission_summary(uuid)',
] as const

/** La reparación operativa del motor (0024) y el diagnóstico: solo la service role. */
export const EARNING_SERVICE_ROLE_ENTRIES = [
  'recalc_seller_commission(uuid,uuid,uuid,commission_movement,uuid,uuid)',
  'commission_agreement_problems()',
] as const

/** Lo que no ejecuta NADIE directamente: lo usan las funciones que lo llaman. */
export const EARNING_INTERNAL_FUNCTIONS = [
  // Las listas de tramos
  'commission_tiers_problem(jsonb)',
  'commission_tiers_normalized(jsonb)',
  'commission_list_json(uuid)',
  'commission_tier_lists_complete()',
  'commission_tier_list_items_guard()',
  'commission_tier_lists_immutable()',
  'commission_current_template(uuid)',
  'commission_create_tier_list(uuid,commission_tier_list_kind,uuid,jsonb,uuid)',
  'organizations_seed_commission_template()',
  'commission_resolve_tier_list(uuid,uuid,jsonb,uuid,uuid)',
  // La tarifa de un acuerdo
  'commission_team_mode(commission_model)',
  'commission_agreement_rate(commission_agreement_mode,bigint,uuid,bigint,integer)',
  'commission_agreement_floor(commission_agreement_mode,bigint,uuid,bigint)',
  'commission_agreement_max(commission_agreement_mode,bigint,uuid,bigint)',
  'commission_effective_agreement(uuid,uuid)',
  'commission_rate_for_seller(uuid,uuid,uuid,integer)',
  'commission_floor_rate(uuid,uuid,uuid)',
  // Compatibilidad padre–hijo y rebajas
  'commission_pair_violation(commission_agreement_mode,bigint,uuid,commission_agreement_mode,bigint,uuid)',
  'commission_half_raffle_violation(uuid,commission_agreement_mode,bigint,uuid,uuid,bigint,raffle_status)',
  'commission_pair_problem_detail(uuid,uuid,commission_agreement_mode,bigint,uuid,commission_agreement_mode,bigint,uuid)',
  'commission_parent_cap(uuid,uuid,commission_agreement_mode,bigint,uuid)',
  'commission_person_name(uuid)',
  'commission_tickets_phrase(integer)',
  'commission_pair_problem(uuid,uuid,commission_agreement_mode,bigint,uuid,uuid,commission_agreement_mode,bigint,uuid,text,text)',
  'commission_team_lock(uuid)',
  'commission_discount_problem(uuid,uuid,commission_agreement_mode,bigint,uuid)',
  'commission_direct_agreement_json(commission_agreement_mode,bigint,uuid)',
  // Disparadores
  'memberships_validate_seller_agreements()',
  'raffles_validate_team_agreements()',
  'memberships_sync_commission()',
] as const

/** Las funciones de la `0078` con su EXECUTE efectivo esperado. */
export const EARNING_FUNCTION_GRANTS: ReadonlyArray<{ signature: string; expected: ExecuteMatrix }> =
  [
    ...EARNING_SESSION_RPCS.map((signature) => ({
      signature,
      expected: { public: false, anon: false, authenticated: true, service_role: false },
    })),
    ...EARNING_SERVICE_ROLE_ENTRIES.map((signature) => ({
      signature,
      expected: { public: false, anon: false, authenticated: false, service_role: true },
    })),
    ...EARNING_INTERNAL_FUNCTIONS.map((signature) => ({
      signature,
      expected: { public: false, anon: false, authenticated: false, service_role: false },
    })),
  ]

/**
 * Las comprobaciones de la `0078` que corre `npm run verify:remote`. Las mismas
 * que ejecuta la prueba de base de datos contra la pila local. Fallan contra el
 * proyecto real hasta que la `0078` se aplique.
 */
export const EARNING_FUNCTION_CHECKS: RemoteCheck[] = [
  {
    nombre: 'Funciones de ganancias con EXECUTE distinto de la lista blanca exacta (0078)',
    sql: executeMatrixSql(EARNING_FUNCTION_GRANTS),
    esperado: 0,
  },
  {
    nombre: 'Funciones de ganancias sin clasificar en la lista blanca (0078)',
    sql: unclassifiedOverloadsSql(EARNING_FUNCTION_GRANTS),
    esperado: 0,
  },
  {
    // La tabla mutable que el motor leia en vivo ya no existe: los tramos son
    // listas inmutables y versionadas (BR-G29).
    nombre: 'La lista de tramos ya no es una tabla mutable (0078)',
    sql: `select 'commission_tiers' as x where to_regclass('public.commission_tiers') is not null
          union all
          select 'commission_tier_lists' where to_regclass('public.commission_tier_lists') is null`,
    esperado: 0,
  },
]
