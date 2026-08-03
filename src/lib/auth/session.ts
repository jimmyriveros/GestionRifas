import 'server-only'

import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'
import type { AppRole } from '@/lib/constants'

export type ActiveMembership = {
  organizationId: string
  organizationName: string
  role: AppRole
  profileId: string
  fullName: string
  email: string
  alias: string | null
}

/**
 * Usuario autenticado segun Supabase Auth, verificado contra el servidor
 * (nunca `getSession()`, cuyo contenido viene de una cookie sin verificar).
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

/**
 * Resuelve la membresia ACTIVA del usuario autenticado (organizacion, rol,
 * datos de perfil). `null` si no hay sesion, o si el usuario, su membresia o
 * su organizacion estan inactivos (docs/BUSINESS_RULES.md BR-A04, BR-A05).
 *
 * Memoizado por request con `cache()`: layouts y paginas pueden llamarlo
 * varias veces sin repetir la consulta.
 */
export const getActiveMembership = cache(async (): Promise<ActiveMembership | null> => {
  const user = await getAuthUser()
  if (!user) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memberships')
    .select(
      `
      organization_id,
      role,
      is_active,
      profile:profiles!memberships_profile_id_fkey ( full_name, email, alias, is_active ),
      organization:organizations ( name, is_active )
    `,
    )
    .eq('profile_id', user.id)

  if (error) {
    // No se expone al usuario (docs/SECURITY.md T14); queda en el log del
    // servidor para poder distinguir un error real de una cuenta inactiva.
    console.error('getActiveMembership: error consultando memberships', error)
    return null
  }
  if (!data) return null

  const active = data.find((m) => m.is_active && m.profile?.is_active && m.organization?.is_active)
  if (!active || !active.profile || !active.organization) return null

  return {
    organizationId: active.organization_id,
    organizationName: active.organization.name,
    role: active.role,
    profileId: user.id,
    fullName: active.profile.full_name,
    email: active.profile.email,
    alias: active.profile.alias,
  }
})
