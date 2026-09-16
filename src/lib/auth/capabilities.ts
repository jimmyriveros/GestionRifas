import type { AppRole } from '@/lib/constants'

/**
 * Capacidades de la aplicacion (D-200, BR-J10).
 *
 * EL CATALOGO Y LA POLITICA PREDETERMINADA, nada mas. Quien necesita saber si
 * una persona puede hacer algo NO lee esta tabla: pregunta al resolvedor central
 * (`hasCapability`, en `lib/auth/capability-resolver.ts`), que recibe la
 * membresia completa. Las Server Actions llegan a el por `authorizeCapability` y
 * las paginas lo llaman directamente. Asi, el dia que exista el modulo de
 * permisos por administrador se reemplaza el resolvedor y no hay que tocar
 * ninguna accion ni ninguna pantalla (D-202). Una prueba estructural impide que
 * alguien vuelva a leer esta tabla desde fuera de `lib/auth`.
 *
 * ESTE ARCHIVO ES EL ESPEJO DE LA BASE DE DATOS. En PostgreSQL viven
 * `app_capability_catalog()`, `app_role_default_capabilities(role)` y
 * `has_org_capability(org, capability)` (migracion `0058`), y las RPC se
 * autorizan alli: la comprobacion de la aplicacion es la primera linea, no la
 * unica (`docs/SECURITY.md` §1). Una prueba de base de datos compara las dos
 * tablas para que no puedan separarse.
 *
 * PURO Y SIN `server-only`: lo importan el resolvedor y esas pruebas.
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
