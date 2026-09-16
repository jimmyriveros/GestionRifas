import 'server-only'

import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import type { AppCapability } from '@/lib/auth/capabilities'
import { hasCapability } from '@/lib/auth/capability-resolver'
import type { AppRole } from '@/lib/constants'
import { getActiveMembership, getAuthUser, type ActiveMembership } from '@/lib/auth/session'

/** Los tres roles. `authorizeCapability` parte de cualquiera y decide por capacidad. */
const ALL_ROLES: readonly AppRole[] = ['owner', 'admin', 'seller']

const PERMISSION_DENIED = 'No tienes permiso para realizar esta acción.'

export function dashboardPathForRole(role: AppRole): '/seller/dashboard' | '/owner/dashboard' {
  return role === 'seller' ? '/seller/dashboard' : '/owner/dashboard'
}

/**
 * Exige sesion + membresia activa. Si hay sesion pero el usuario/membresia/
 * organizacion estan inactivos, cierra la sesion (BR-A04: una sesion previa
 * no puede seguir operando) y redirige al login con un mensaje explicito.
 */
export async function requireActiveMembership() {
  const user = await getAuthUser()
  if (!user) {
    redirect('/login')
  }

  const membership = await getActiveMembership()
  if (!membership) {
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login?error=inactive')
  }

  return membership
}

export async function requireRole(allowedRoles: AppRole[]) {
  const membership = await requireActiveMembership()
  if (!allowedRoles.includes(membership.role)) {
    redirect('/denied')
  }
  return membership
}

/** Owner y Admin comparten el portal administrativo (CLAUDE.md 21). */
export async function requireStaff() {
  return requireRole(['owner', 'admin'])
}

/**
 * Variante para Server Actions (docs/SECURITY.md 5): en vez de redirigir,
 * devuelve un error mostrable. Redirigir a `/denied` desde el envio de un
 * formulario haria perder lo que la persona estaba escribiendo, y ademas
 * oculta el motivo real del rechazo.
 *
 * Es la PRIMERA linea de una accion, nunca la unica: RLS y las restricciones
 * de la base de datos siguen siendo la frontera real (docs/SECURITY.md 1).
 */
export async function authorizeAction(
  allowedRoles: readonly AppRole[],
): Promise<{ membership: ActiveMembership } | { error: string }> {
  const user = await getAuthUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Vuelve a ingresar.' }
  }

  const membership = await getActiveMembership()
  if (!membership) {
    return { error: 'Tu cuenta está inactiva. Contacta a tu administrador.' }
  }

  if (!allowedRoles.includes(membership.role)) {
    return { error: PERMISSION_DENIED }
  }

  return { membership }
}

/**
 * Como `authorizeAction`, pero por CAPACIDAD y no por rol (D-200, BR-J10).
 *
 * Es la guarda de toda Server Action que el rol por si solo no explica: quien la
 * use no vuelve a escribir `role === 'admin'` ni lee la tabla por rol. Decide el
 * resolvedor central (`hasCapability`, en `lib/auth/capability-resolver.ts`), que
 * recibe la membresia completa; el dia que exista el modulo de permisos se
 * reemplaza el resolvedor y esta guarda —y las acciones que la usan— no cambian
 * (D-202). Quien de verdad autoriza la operacion es su espejo en PostgreSQL,
 * `has_org_capability` (migracion `0058`).
 *
 * `roles` acota ademas QUIEN puede llegar a preguntar: crear una rifa es del
 * personal (BR-R01) aunque algun dia un vendedor recibiera la capacidad. Un rol
 * fuera de la lista recibe el rechazo de siempre, sin consultar la capacidad.
 *
 * `deniedMessage` es la frase para quien SI tiene el rol pero no la capacidad,
 * cuando la base responde con una propia y conviene decir lo mismo.
 */
export async function authorizeCapability(
  capability: AppCapability,
  options: { roles?: readonly AppRole[]; deniedMessage?: string } = {},
): Promise<{ membership: ActiveMembership } | { error: string }> {
  const auth = await authorizeAction(options.roles ?? ALL_ROLES)
  if ('error' in auth) return auth

  if (!(await hasCapability(auth.membership, capability))) {
    return { error: options.deniedMessage ?? PERMISSION_DENIED }
  }

  return auth
}
