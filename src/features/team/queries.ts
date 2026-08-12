import 'server-only'

import type { OrgMember } from '@/features/users/queries'
import { createClient } from '@/lib/supabase/server'
import type { AppRole, TicketPaymentStatus } from '@/lib/constants'

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

export type TeamMemberTotals = {
  /** Boletas que tiene, vendidas o no. */
  ticketsTotal: number
  /** Vendidas: asignadas a un cliente. */
  ticketsAssigned: number
  /** Pagadas por completo. Son las que cuentan para la comision. */
  ticketsPaid: number
  totalSold: number
  totalCollected: number
  pendingAmount: number
}

export type TeamMemberWithTotals = TeamMember & TeamMemberTotals

const ZERO: TeamMemberTotals = {
  ticketsTotal: 0,
  ticketsAssigned: 0,
  ticketsPaid: 0,
  totalSold: 0,
  totalCollected: 0,
  pendingAmount: 0,
}

/**
 * El equipo con sus numeros, en DOS consultas fijas.
 *
 * Los indicadores salen de `team_sales_summary` (migracion 0022), que devuelve
 * una fila por integrante en una sola llamada: sin una consulta por vendedor
 * (encargo del usuario, seccion PERFORMANCE). Quien puede preguntar y por quien
 * lo decide la propia funcion, no este archivo.
 */
export async function listTeamWithTotals(parentSellerId: string): Promise<TeamMemberWithTotals[]> {
  const supabase = await createClient()

  const [members, { data: summary, error }] = await Promise.all([
    listTeamMembers(parentSellerId),
    supabase.rpc('team_sales_summary'),
  ])

  if (error) throw error

  const totals = new Map<string, TeamMemberTotals>(
    (summary ?? []).map((row) => [
      row.seller_id,
      {
        ticketsTotal: Number(row.tickets_total ?? 0),
        ticketsAssigned: Number(row.tickets_assigned ?? 0),
        ticketsPaid: Number(row.tickets_paid ?? 0),
        totalSold: Number(row.total_sold ?? 0),
        totalCollected: Number(row.total_collected ?? 0),
        pendingAmount: Number(row.pending_amount ?? 0),
      },
    ]),
  )

  return members.map((member) => ({ ...member, ...(totals.get(member.profileId) ?? ZERO) }))
}

/**
 * Un integrante concreto, o `null` si no es del equipo de quien consulta.
 *
 * Devolver `null` —y que la pantalla responda 404— es deliberado: un id ajeno no
 * debe distinguirse de un id inexistente, para no confirmar que ese vendedor
 * existe (BR-E05, BR-U07).
 */
export async function getTeamMember(
  parentSellerId: string,
  memberId: string,
): Promise<TeamMemberWithTotals | null> {
  const members = await listTeamWithTotals(parentSellerId)
  return members.find((member) => member.profileId === memberId) ?? null
}

export type TeamMemberSale = {
  ticketId: string
  dailyNumber: string | null
  weeklyNumber: string | null
  salePrice: number | null
  paidAmount: number
  paymentStatus: TicketPaymentStatus
  saleDate: string | null
}

/**
 * Las ventas de un integrante.
 *
 * Sin datos del cliente a proposito: el equipo comparte ventas, no cartera
 * (BR-E05). La funcion tampoco los devuelve, asi que no es una omision de esta
 * pantalla que otra pudiera deshacer por descuido.
 */
export async function listTeamMemberSales(
  memberId: string,
  limit = 20,
): Promise<TeamMemberSale[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('team_member_sales', {
    p_member_id: memberId,
    p_limit: limit,
  })

  if (error) throw error

  return (data ?? []).map((row) => ({
    ticketId: row.ticket_id,
    dailyNumber: row.daily_number,
    weeklyNumber: row.weekly_number,
    salePrice: row.sale_price === null ? null : Number(row.sale_price),
    paidAmount: Number(row.paid_amount ?? 0),
    paymentStatus: row.payment_status,
    saleDate: row.sale_date,
  }))
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
