import 'server-only'

import { cache } from 'react'

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
  /** Vendedor a cargo, si pertenece al equipo de alguien (BR-E01). */
  parentSellerId: string | null
  /**
   * Cuando configuro su contrasena. `null` = invitacion pendiente: la cuenta
   * existe pero todavia no se puede usar (BR-E14). No es lo mismo que
   * `isActive`, que dice si el personal le quito el acceso.
   */
  activatedAt: string | null
}

/**
 * Exportados para que «Mi equipo» lea las membresias EXACTAMENTE igual
 * (`features/team/queries.ts`): un integrante y un vendedor de la organizacion
 * son la misma fila, y tener dos mapeos era garantizar que algun dia divergieran.
 */
export const MEMBER_SELECT = `
  id,
  role,
  is_active,
  created_at,
  parent_seller_id,
  profile:profiles!memberships_profile_id_fkey ( id, full_name, alias, phone, email, is_active, activated_at )
`

export type MemberRow = {
  id: string
  role: AppRole
  is_active: boolean
  created_at: string
  parent_seller_id: string | null
  profile: {
    id: string
    full_name: string
    alias: string | null
    phone: string
    email: string
    is_active: boolean
    activated_at: string | null
  } | null
}

export function mapMember(row: MemberRow): OrgMember | null {
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
    parentSellerId: row.parent_seller_id,
    activatedAt: row.profile.activated_at,
  }
}

/**
 * TODOS los miembros de la organizacion, memoizados POR PETICION con `cache()`
 * de React (D-103, D-104).
 *
 * Casi todas las pantallas necesitan esta lista mas de una vez: el listado de
 * boletas la pide para poner el nombre del vendedor en cada fila y otra vez
 * para llenar el desplegable «Vendedor»; la ficha de un cliente, una vez por
 * cada bloque que la usa. Eran dos y tres consultas identicas en la misma
 * pasada.
 *
 * NO SE FILTRA POR ROL EN LA CONSULTA, y es deliberado (D-104). Cuando cada
 * llamada pedia sus propios roles habia dos consultas distintas por pantalla
 * —una de `['seller']` y otra de `['owner','admin','seller']`— que el memo no
 * podia compartir por tener claves distintas. Pidiendo siempre lo mismo, la
 * pantalla entera se resuelve con UNA. Los miembros de una organizacion son
 * decenas, asi que traer los tres roles no cuesta mas que traer uno; el ahorro
 * de una ida y vuelta a la base de datos, si.
 *
 * Quien decide que filas se ven sigue siendo `memberships_select`, no esta
 * consulta: un vendedor que llame a esto se ve unicamente a si mismo.
 */
const listAllOrgMembers = cache(async (): Promise<OrgMember[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memberships')
    .select(MEMBER_SELECT)
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data as MemberRow[] | null)?.flatMap((row) => mapMember(row) ?? []) ?? []
})

/**
 * Los miembros con alguno de esos roles. La firma no cambia; lo que cambia es
 * que el filtro se aplica en memoria sobre una lista que ya esta en la mano.
 */
export async function listOrgMembers(roles: AppRole[]): Promise<OrgMember[]> {
  const members = await listAllOrgMembers()
  return members.filter((member) => roles.includes(member.role))
}
