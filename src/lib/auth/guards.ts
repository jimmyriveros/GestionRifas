import 'server-only'

import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import type { AppRole } from '@/lib/constants'
import { getActiveMembership, getAuthUser } from '@/lib/auth/session'

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
