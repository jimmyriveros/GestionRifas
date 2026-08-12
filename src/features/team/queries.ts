import 'server-only'

import type { OrgMember } from '@/features/users/queries'
import { createClient } from '@/lib/supabase/server'
import type { AppRole } from '@/lib/constants'

/**
 * El equipo del vendedor que consulta (BR-E01).
 *
 * No filtra por `parent_seller_id` en la consulta y luego confia en ello: la
 * politica `memberships_select` (0022) ya limita las filas a uno mismo, su
 * equipo y —si es personal— su organizacion. El filtro explicito esta ademas
 * por claridad y eficiencia, que es el mismo criterio del resto del proyecto
 * (docs/ARCHITECTURE.md 7.1): la seguridad la pone la RLS, no la clausula.
 *
 * Se usa el mismo `select` que `features/users/queries.ts` para que un
 * integrante de equipo y un vendedor de la organizacion se lean igual; lo que
 * cambia es quien pregunta, no la forma del dato.
 */

export type TeamMember = OrgMember

const TEAM_SELECT = `
  id,
  role,
  is_active,
  created_at,
  profile:profiles!memberships_profile_id_fkey ( id, full_name, alias, phone, email, is_active )
`

type TeamRow = {
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

function mapMember(row: TeamRow): TeamMember | null {
  if (!row.profile) return null
  return {
    membershipId: row.id,
    profileId: row.profile.id,
    role: row.role,
    // BR-A05: el acceso efectivo exige membresia Y perfil activos.
    isActive: row.is_active && row.profile.is_active,
    fullName: row.profile.full_name,
    alias: row.profile.alias,
    phone: row.profile.phone,
    email: row.profile.email,
    createdAt: row.created_at,
  }
}

/** Integrantes del equipo de `parentSellerId`, en el orden en que se agregaron. */
export async function listTeamMembers(parentSellerId: string): Promise<TeamMember[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memberships')
    .select(TEAM_SELECT)
    .eq('parent_seller_id', parentSellerId)
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data as TeamRow[] | null)?.flatMap((row) => mapMember(row) ?? []) ?? []
}

/**
 * Si el vendedor que consulta pertenece al equipo de alguien.
 *
 * Decide si puede formar equipo propio (BR-E03): un integrante no puede. La
 * pantalla lo usa para explicarlo en vez de ofrecer un boton que la base de
 * datos va a rechazar.
 */
export async function isTeamMember(profileId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memberships')
    .select('parent_seller_id')
    .eq('profile_id', profileId)
    .maybeSingle()

  if (error) throw error
  return data?.parent_seller_id != null
}
