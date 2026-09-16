import 'server-only'

import { ROLE_DEFAULT_CAPABILITIES, type AppCapability } from '@/lib/auth/capabilities'
import type { ActiveMembership } from '@/lib/auth/session'

/**
 * EL RESOLVEDOR CENTRAL de capacidades (D-200, D-202).
 *
 * Toda pregunta «¿puede esta persona...?» que el rol por si solo no explica
 * termina aqui: la guarda de las Server Actions (`authorizeCapability`) y las
 * paginas que deciden si pintan una accion. Nadie mas lee la tabla por rol de
 * `capabilities.ts`, y una prueba estructural lo vigila.
 *
 * RECIBE LA MEMBRESIA COMPLETA, no el rol. Hoy solo mira el rol, porque la
 * politica vigente es la predeterminada —el espejo de
 * `app_role_default_capabilities`—, pero el modulo de permisos por
 * administrador necesitara la organizacion y la persona. Ese dia se reescribe
 * el cuerpo de esta funcion —y el de `has_org_capability` en PostgreSQL— y
 * ninguna accion ni pagina cambia. Por eso ya es asincrona: consultar las
 * capacidades asignadas sera una lectura.
 *
 * NO ES LA AUTORIDAD. La que manda es `has_org_capability`, dentro de cada RPC
 * de premios y del disparador de `raffles`. Esto sirve para no ofrecer, ni dejar
 * empezar, lo que la base va a rechazar.
 */
export async function hasCapability(
  membership: ActiveMembership,
  capability: AppCapability,
): Promise<boolean> {
  return ROLE_DEFAULT_CAPABILITIES[membership.role].includes(capability)
}
