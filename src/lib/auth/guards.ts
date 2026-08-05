import 'server-only'

import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import type { AppRole } from '@/lib/constants'
import { getActiveMembership, getAuthUser, type ActiveMembership } from '@/lib/auth/session'

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
  allowedRoles: AppRole[],
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
    return { error: 'No tienes permiso para realizar esta acción.' }
  }

  return { membership }
}
