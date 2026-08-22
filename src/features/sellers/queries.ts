import 'server-only'

import { cache } from 'react'

import { listOrgMembers, type OrgMember } from '@/features/users/queries'
import { fetchAllRows } from '@/lib/supabase/paginate'
import { createClient } from '@/lib/supabase/server'

/**
 * Vendedores con sus indicadores. La gestion (alta, edicion, activacion) vive
 * en `features/users`: un vendedor es una membresia con rol `seller`, no una
 * entidad aparte. Aqui solo se agregan sus numeros.
 */

export type SellerTotals = {
  ticketsTotal: number
  ticketsAvailable: number
  ticketsAssigned: number
  ticketsPendingApproval: number
  ticketsDraft: number
  ticketsCancelled: number
  ticketsUnpaid: number
  ticketsPartial: number
  ticketsPaid: number
  totalSold: number
  totalCollected: number
  pendingAmount: number
}

export type SellerWithTotals = OrgMember & SellerTotals

const ZERO: SellerTotals = {
  ticketsTotal: 0,
  ticketsAvailable: 0,
  ticketsAssigned: 0,
  ticketsPendingApproval: 0,
  ticketsDraft: 0,
  ticketsCancelled: 0,
  ticketsUnpaid: 0,
  ticketsPartial: 0,
  ticketsPaid: 0,
  totalSold: 0,
  totalCollected: 0,
  pendingAmount: 0,
}

type SellerSummaryRow = {
  tickets_total: number | null
  tickets_available: number | null
  tickets_assigned: number | null
  tickets_pending_approval: number | null
  tickets_draft: number | null
  tickets_cancelled: number | null
  tickets_unpaid: number | null
  tickets_partial: number | null
  tickets_paid: number | null
  total_sold: number | null
  total_collected: number | null
  pending_amount: number | null
}

function addTotals(acc: SellerTotals, row: SellerSummaryRow): SellerTotals {
  return {
    ticketsTotal: acc.ticketsTotal + (row.tickets_total ?? 0),
    ticketsAvailable: acc.ticketsAvailable + (row.tickets_available ?? 0),
    ticketsAssigned: acc.ticketsAssigned + (row.tickets_assigned ?? 0),
    ticketsPendingApproval: acc.ticketsPendingApproval + (row.tickets_pending_approval ?? 0),
    ticketsDraft: acc.ticketsDraft + (row.tickets_draft ?? 0),
    ticketsCancelled: acc.ticketsCancelled + (row.tickets_cancelled ?? 0),
    ticketsUnpaid: acc.ticketsUnpaid + (row.tickets_unpaid ?? 0),
    ticketsPartial: acc.ticketsPartial + (row.tickets_partial ?? 0),
    ticketsPaid: acc.ticketsPaid + (row.tickets_paid ?? 0),
    totalSold: acc.totalSold + (row.total_sold ?? 0),
    totalCollected: acc.totalCollected + (row.total_collected ?? 0),
    pendingAmount: acc.pendingAmount + (row.pending_amount ?? 0),
  }
}

/**
 * `v_seller_summary` en crudo: una fila por (organizacion, rifa, vendedor).
 *
 * Es un AGREGADO sobre la tabla de boletas entera, asi que cuesta lo mismo
 * traer una fila que todas y lo caro es pedirlo dos veces. El panel
 * administrativo lo necesitaba dos veces en la misma pasada —para el resumen
 * por vendedor y para los totales de la organizacion—, asi que se memoiza POR
 * PETICION con `cache()` de React y la segunda llamada no vuelve a la base de
 * datos (D-103).
 *
 * La clave del memo es el argumento, y `cache()` distingue `f()` de
 * `f(undefined)`: por eso la rifa se pasa SIEMPRE, como `null` cuando no hay
 * filtro. Quien lo llame con azucar (`raffleId?: string`) es la envoltura.
 *
 * La lectura se pagina con `fetchAllRows`. Sin filtro de rifa la cardinalidad
 * es rifas x vendedores y, al superar 1.000, PostgREST devolveria solo las
 * primeras mil SIN error (I-011): los totales del panel y de los reportes se
 * quedarian cortos en silencio, que es la peor forma de equivocarse con dinero.
 */
export const readSellerSummary = cache(
  async (raffleId: string | null): Promise<(SellerSummaryRow & { seller_id: string | null })[]> => {
    const supabase = await createClient()
    const { rows } = await fetchAllRows<SellerSummaryRow & { seller_id: string | null }>(
      (from, to) => {
        let query = supabase.from('v_seller_summary').select('*')
        if (raffleId) query = query.eq('raffle_id', raffleId)
        // Orden estable: sin el, dos bloques consecutivos podrian repetir u
        // omitir filas y los totales saldrian mal.
        return query
          .order('seller_id', { ascending: true })
          .order('raffle_id', { ascending: true })
          .range(from, to)
      },
    )
    return rows
  },
)

/**
 * Los vendedores de la organizacion con sus indicadores, en dos consultas
 * fijas: la lista de personas y el agregado; nunca una por vendedor
 * (docs/ARCHITECTURE.md 10).
 */
export async function listSellersWithTotals(raffleId?: string): Promise<SellerWithTotals[]> {
  const [sellers, summaries] = await Promise.all([
    listOrgMembers(['seller']),
    readSellerSummary(raffleId ?? null),
  ])

  const totalsBySeller = new Map<string, SellerTotals>()
  for (const row of summaries) {
    if (!row.seller_id) continue
    totalsBySeller.set(row.seller_id, addTotals(totalsBySeller.get(row.seller_id) ?? ZERO, row))
  }

  return sellers.map((seller) => ({
    ...seller,
    ...(totalsBySeller.get(seller.profileId) ?? ZERO),
  }))
}

export type SellerDetail = SellerWithTotals & { clientsCount: number }

export async function getSellerWithTotals(profileId: string): Promise<SellerDetail | null> {
  const sellers = await listSellersWithTotals()
  const seller = sellers.find((item) => item.profileId === profileId)
  if (!seller) return null

  // Conteo EXACTO en la base de datos (`head: true` no trae filas): contar en
  // memoria seria erroneo, porque PostgREST corta las respuestas en 1.000 filas.
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', profileId)
    .is('archived_at', null)

  if (error) throw error

  return { ...seller, clientsCount: count ?? 0 }
}

export type SellerOption = { id: string; fullName: string; alias: string | null }

/** Vendedores ACTIVOS para selectores: solo ellos pueden recibir boletas. */
export async function listActiveSellerOptions(): Promise<SellerOption[]> {
  const members = await listOrgMembers(['seller'])
  return members
    .filter((member) => member.isActive)
    .map((member) => ({ id: member.profileId, fullName: member.fullName, alias: member.alias }))
}
