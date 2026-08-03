import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { AppRole } from '@/lib/constants'

/**
 * Lecturas de usuarios de la organizacion. La politica `memberships_select`
 * limita las filas al personal de la propia organizacion, asi que un vendedor
 * que llame a esto solo se veria a si mismo (docs/SECURITY.md 4.3).
 */

export type OrgMember = {
  membershipId: string
  profileId: string
  role: AppRole
  isActive: boolean
  fullName: string
  alias: string | null
  phone: string
  email: string
  createdAt: string
}

const MEMBER_SELECT = `
  id,
  role,
  is_active,
  created_at,
  profile:profiles!memberships_profile_id_fkey ( id, full_name, alias, phone, email, is_active )
`

type MemberRow = {
  id: string
  role: AppRole
  is_active: boolean
  created_at: string
  profile: {
    id: string
    full_name: string
    alias: string | null
    phone: string
    email: string
    is_active: boolean
  } | null
}

function mapMember(row: MemberRow): OrgMember | null {
  if (!row.profile) return null
  return {
    membershipId: row.id,
    profileId: row.profile.id,
    role: row.role,
    // BR-A05: el acceso efectivo exige membresia Y perfil activos. Mostrar solo
    // uno de los dos daria una impresion falsa de quien puede entrar.
    isActive: row.is_active && row.profile.is_active,
    fullName: row.profile.full_name,
    alias: row.profile.alias,
    phone: row.profile.phone,
    email: row.profile.email,
    createdAt: row.created_at,
  }
}

export async function listOrgMembers(roles: AppRole[]): Promise<OrgMember[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memberships')
    .select(MEMBER_SELECT)
    .in('role', roles)
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data as MemberRow[] | null)?.flatMap((row) => mapMember(row) ?? []) ?? []
}

export async function getOrgMember(profileId: string): Promise<OrgMember | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memberships')
    .select(MEMBER_SELECT)
    .eq('profile_id', profileId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return mapMember(data as MemberRow)
}
