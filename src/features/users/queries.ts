import 'server-only'

import { cache } from 'react'

import { pageBeyondEnd, type PagedList } from '@/lib/list-page'
import { fetchAllRows } from '@/lib/supabase/paginate'
import type { ListSort } from '@/lib/list-sort'
import { createClient } from '@/lib/supabase/server'
import { PAGE_SIZE, type AppRole, type CommissionModel } from '@/lib/constants'

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
   * Como se le paga MIENTRAS pertenezca a un equipo (BR-G24). Con
   * `parentSellerId` nulo esto no aplica —cobra la mitad del precio (BR-G13)—
   * pero se conserva: sacar a alguien del equipo y volver a meterlo lo devuelve
   * a la configuracion que tenia, en vez de reiniciarla en silencio (D-127).
   */
  commissionModel: CommissionModel
  /** Su cifra fija por boleta. `null` con `tiered`, que es lo normal. */
  fixedCommissionAmount: number | null
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
  commission_model,
  fixed_commission_amount,
  profile:profiles!memberships_profile_id_fkey ( id, full_name, alias, phone, email, is_active, activated_at )
`

export type MemberRow = {
  id: string
  role: AppRole
  is_active: boolean
  created_at: string
  parent_seller_id: string | null
  commission_model: CommissionModel
  fixed_commission_amount: number | null
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
    commissionModel: row.commission_model,
    fixedCommissionAmount:
      row.fixed_commission_amount === null ? null : Number(row.fixed_commission_amount),
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

  /*
    PAGINADA CON `fetchAllRows`, y no por tamano: PostgREST corta toda respuesta
    en 1.000 filas y no avisa —llegan 1.000 y `error` nulo, igual que si fueran
    todas (I-011)—. Esta lista no es solo el listado de «Administradores»: es el
    MAPA DE NOMBRES que usan las boletas, los clientes y los pagos para escribir
    de quien es cada fila. Truncada, no falta una pagina: faltan nombres
    repartidos por toda la aplicacion, sustituidos por «Vendedor», sin que nada
    lo delate.

    Y `profile_id` cierra el orden, para que dos altas del mismo instante no
    cambien de sitio entre dos lecturas.
  */
  const { rows } = await fetchAllRows<MemberRow>((from, to) =>
    supabase
      .from('memberships')
      .select(MEMBER_SELECT)
      .order('created_at', { ascending: true })
      .order('profile_id', { ascending: true })
      .range(from, to),
  )

  return rows.flatMap((row) => mapMember(row) ?? [])
})

/**
 * Los miembros con alguno de esos roles. La firma no cambia; lo que cambia es
 * que el filtro se aplica en memoria sobre una lista que ya esta en la mano.
 */
export async function listOrgMembers(roles: AppRole[]): Promise<OrgMember[]> {
  const members = await listAllOrgMembers()
  return members.filter((member) => roles.includes(member.role))
}

/**
 * Una PAGINA de miembros con esos roles, ordenada y contada POR LA BASE (D-214).
 *
 * Va contra `v_org_member_list` (migracion 0076), que es `security_invoker`:
 * hereda `memberships_select` y `profiles_select`, asi que devuelve
 * exactamente las mismas filas que veria `listOrgMembers`. Lo que cambia es que
 * el nombre, el estado efectivo de la cuenta y el tamano del equipo son
 * COLUMNAS, de modo que `order` y `range` los resuelve PostgreSQL.
 *
 * Antes se leia la organizacion entera con `fetchAllRows` y se recortaba en el
 * servidor: el navegador recibia una pagina, pero el servidor traia y ordenaba
 * todas las filas en cada visita.
 */
export async function listOrgMembersPage(
  roles: AppRole[],
  options: { page: number; sort: ListSort | null },
): Promise<PagedList<OrgMember>> {
  const supabase = await createClient()
  const pageSize = PAGE_SIZE
  const page = Math.max(1, options.page)

  const query = supabase
    .from('v_org_member_list')
    .select(MEMBER_VIEW_SELECT, { count: 'exact' })
    .in('role', roles)

  /*
    `nullsFirst: false` por lo de siempre: un `desc` en PostgreSQL pone los
    nulos primero, y el alias o el telefono pueden faltar. Y `profile_id` cierra
    SIEMPRE, para que dos altas del mismo instante no cambien de pagina entre
    dos consultas.
  */
  const ordered = options.sort
    ? query.order(MEMBER_SORT_DB[options.sort.column as MemberSortColumn] ?? 'created_at', {
        ascending: options.sort.direction === 'asc',
        nullsFirst: false,
      })
    : query.order('created_at', { ascending: true })

  const { data, error, count } = await ordered
    .order('profile_id', { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (error) {
    if (!pageBeyondEnd(error)) throw error
    // La pagina no existe: cero filas, pero el total de verdad.
    const { count: real } = await supabase
      .from('v_org_member_list')
      .select('profile_id', { head: true, count: 'exact' })
      .in('role', roles)
    return { rows: [], total: real ?? 0, page, pageSize }
  }

  return {
    rows: (data ?? []).map(mapMemberViewRow),
    total: count ?? 0,
    page,
    pageSize,
  }
}

const MEMBER_VIEW_SELECT =
  'membership_id, profile_id, role, created_at, parent_seller_id, commission_model, fixed_commission_amount, full_name, alias, phone, email, activated_at, account_active, team_size, parent_seller_name'

/**
 * Una fila de la vista. PostgreSQL no puede demostrar que las columnas de una
 * vista no sean nulas, asi que el generador de tipos las marca todas
 * anulables; el mapeo pone el mismo valor por defecto que ya usaban las otras
 * lecturas (`listClients`).
 */
type MemberViewRow = {
  membership_id: string | null
  profile_id: string | null
  role: AppRole | null
  created_at: string | null
  parent_seller_id: string | null
  commission_model: CommissionModel | null
  fixed_commission_amount: number | null
  full_name: string | null
  alias: string | null
  phone: string | null
  email: string | null
  activated_at: string | null
  account_active: boolean | null
  team_size: number | null
  parent_seller_name: string | null
}

/** Misma forma que `mapMember`; el estado efectivo ya lo calcula la vista. */
function mapMemberViewRow(row: MemberViewRow): OrgMember {
  return {
    membershipId: row.membership_id ?? '',
    profileId: row.profile_id ?? '',
    role: row.role ?? 'seller',
    // La vista ya calcula la conjuncion de las dos banderas (BR-A05).
    isActive: row.account_active ?? false,
    fullName: row.full_name ?? '',
    alias: row.alias,
    phone: row.phone ?? '',
    email: row.email ?? '',
    createdAt: row.created_at ?? '',
    parentSellerId: row.parent_seller_id,
    commissionModel: row.commission_model ?? 'tiered',
    fixedCommissionAmount:
      row.fixed_commission_amount === null ? null : Number(row.fixed_commission_amount),
    activatedAt: row.activated_at,
  }
}

/**
 * Las columnas por las que se puede ordenar «Administradores» (P1-H, D-214).
 *
 * Son los `id` de las columnas de `UsersTable`. «Acciones» no esta: no es un
 * dato. «Estado» ordena por `account_active`, que es la conjuncion de las dos
 * banderas, igual que la insignia que se pinta (BR-A05).
 */
export const MEMBER_SORT_COLUMNS = [
  'fullName',
  'role',
  'email',
  'phone',
  'isActive',
  'createdAt',
] as const

export type MemberSortColumn = (typeof MEMBER_SORT_COLUMNS)[number]

/** De nombre de columna a columna de la vista. Lo que no este aqui no se pide. */
const MEMBER_SORT_DB: Record<MemberSortColumn, string> = {
  fullName: 'full_name',
  role: 'role',
  email: 'email',
  phone: 'phone',
  isActive: 'account_active',
  createdAt: 'created_at',
}

