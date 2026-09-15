import type { AppRole } from '@/lib/constants'

/**
 * Capacidades de la aplicacion (D-200, BR-J10).
 *
 * UN SOLO SITIO donde se decide quien puede hacer algo que no se explica con el
 * rol a secas. Las pantallas y las Server Actions preguntan por la CAPACIDAD
 * —`authorizeCapability('raffles.prizes.manage')`—, nunca por el rol: el dia que
 * exista el modulo de permisos se cambia el resolvedor y no hay que tocar
 * ninguna accion.
 *
 * ESTE ARCHIVO ES EL ESPEJO DE LA BASE DE DATOS. En PostgreSQL viven
 * `app_capability_catalog()`, `app_role_default_capabilities(role)` y
 * `has_org_capability(org, capability)` (migracion `0058`), y las RPC se
 * autorizan alli: esta comprobacion es la primera linea, no la unica
 * (`docs/SECURITY.md` §1). Una prueba de base de datos compara las dos tablas
 * para que no puedan separarse.
 *
 * PURO Y SIN `server-only`: lo necesitan tambien las pantallas para decidir si
 * pintan una accion. Lo que nunca decide una pantalla es si la operacion ocurre.
 */

/** Catalogo cerrado. Una capacidad que no este aqui es «no» para todo el mundo. */
export const APP_CAPABILITIES = ['raffles.prizes.manage'] as const

export type AppCapability = (typeof APP_CAPABILITIES)[number]

/**
 * La politica inicial, la del encargo de premios configurables:
 *
 *   * el Dueno tiene TODAS las capacidades del catalogo;
 *   * el Administrador recibe `raffles.prizes.manage` por compatibilidad,
 *     mientras no exista el modulo de permisos;
 *   * el Vendedor no tiene ninguna.
 */
export const ROLE_DEFAULT_CAPABILITIES: Record<AppRole, readonly AppCapability[]> = {
  owner: APP_CAPABILITIES,
  admin: ['raffles.prizes.manage'],
  seller: [],
}

/** Si un rol tiene una capacidad con la politica vigente. */
export function roleHasCapability(role: AppRole, capability: AppCapability): boolean {
  return ROLE_DEFAULT_CAPABILITIES[role].includes(capability)
}
