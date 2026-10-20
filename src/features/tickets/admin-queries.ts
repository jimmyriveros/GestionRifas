import 'server-only'

import { listRaffleNumberFormats, withNumberFormat } from '@/features/raffles/number-formats'
import type { RaffleNumberFormat } from '@/lib/ticket-number-format'

import { cache } from 'react'
import { z } from 'zod'

import {
  BULK_SELECTION_MAX,
  PAGE_SIZE,
  type AdminTicketPaymentState,
  type RaffleStatus,
  type TicketInventoryStatus,
} from '@/lib/constants'
import type { ListSort } from '@/lib/list-sort'
import { normalizeSearchTerm } from '@/lib/search'
import { fetchAllRows } from '@/lib/supabase/paginate'
import { createClient } from '@/lib/supabase/server'

import { INVENTORY_COPY } from '@/features/inventory/copy'
import type { TicketCustody } from '@/features/inventory/rules'

import { parseClearanceState, type ClearanceState } from './clearance-receipt'
import { sellerNameMap } from './queries'
import type { AdminTicketSortColumn } from './sort-options'
import type { AdminTicketEligibility } from './selection/eligibility'

/**
 * Lecturas de boletas del PORTAL ADMINISTRATIVO (D-198, BR-Q02).
 *
 * El personal ya no lee `tickets`: `tickets_select` le devuelve cero filas desde
 * la migracion 0057. Lo que ve llega por las funciones `admin_*`, que devuelven
 * una LISTA BLANCA —numeros, rifa, vendedor, estado de inventario, estado de
 * pago en dos valores y paz y salvo— y nada mas. Estos tipos no declaran
 * cliente, precio, abonado, saldo ni abonos: no pueden recibirlos, asi que
 * ninguna pantalla los puede pintar ni mandar al navegador.
 *
 * Es el mismo patron que D-092 uso para las ventas del equipo. El vendedor
 * sigue leyendo por `queries.ts`, sin un solo cambio.
 */

export type AdminTicketFilters = {
  raffleId?: string
  sellerId?: string
  inventoryStatus?: TicketInventoryStatus
  /** «Sin pagar» incluye `unpaid` y `partial`; lo resuelve SQL (BR-Q04). */
  paymentState?: AdminTicketPaymentState
  /**
   * Numero diario o semanal, entero o en parte. Cualquier otro termino —un
   * nombre, un telefono, un codigo interno— no encuentra nada (BR-Q05).
   */
  search?: string
  /** La seleccion multiple pide boletas concretas por su id (BR-B01). */
  ticketIds?: readonly string[]
  /** Quien tiene la boleta: inventario comun, apartada o con un vendedor (D-257). */
  custody?: TicketCustody
  page?: number
  pageSize?: number
  /** Orden pedido desde la URL, ya validado contra `ADMIN_TICKET_SORT_COLUMNS`. */
  sort?: ListSort<AdminTicketSortColumn> | null
}

/*
  La lista blanca del ORDEN del personal vive en `sort-options.ts` desde I-155:
  el control del telefono es un componente de CLIENTE y este archivo empieza con
  `server-only`, la misma razon que D-216 dio para la del vendedor. Se reexporta
  aqui para que quien la pedia siga pidiendola donde estaba.
*/
export { ADMIN_TICKET_SORT_COLUMNS, type AdminTicketSortColumn } from './sort-options'

export type AdminTicketListItem = {
  id: string
  dailyNumber: string | null
  weeklyNumber: string | null
  inventoryStatus: TicketInventoryStatus
  /** `null` si la boleta no esta asignada: sin venta no hay estado de pago. */
  paymentState: AdminTicketPaymentState | null
  /** Paz y salvo, ya resuelto por SQL y solo de boletas asignadas (BR-I15). */
  clearanceState: ClearanceState
  raffleId: string
  raffleName: string
  raffleShortCode: string
  /** `null` en el inventario comun, libre o apartada (D-257). */
  sellerId: string | null
  /**
   * Lo que se lee en la columna «Vendedor»: su nombre, «Inventario común» o
   * «Apartada por …». Las listas lo pintan tal cual.
   */
  sellerName: string
  custody: TicketCustody
  /** Quien la tiene apartada y hasta cuando; solo con `custody === 'held'`. */
  heldById: string | null
  heldByName: string | null
  holdExpiresAt: string | null
  /** D-261: los numeros de SU rifa: cuantos son y como se llaman. */
  numberFormat?: RaffleNumberFormat
}

type AdminListRow = {
  id: string
  daily_number: string | null
  weekly_number: string | null
  inventory_status: TicketInventoryStatus
  payment_state: string | null
  clearance_state: string | null
  raffle_id: string
  raffle_name: string | null
  raffle_short_code: string | null
  seller_id: string | null
  held_by: string | null
  hold_expires_at: string | null
  total_count: number
}

function parsePaymentState(value: string | null): AdminTicketPaymentState | null {
  return value === 'paid' || value === 'unpaid' ? value : null
}

/** Quien tiene la boleta, y como se lee en la columna «Vendedor» (D-257). */
function custodyOf(
  sellerId: string | null,
  heldBy: string | null,
  sellerNames: Map<string, string>,
): { custody: TicketCustody; sellerName: string; heldByName: string | null } {
  if (sellerId) {
    return {
      custody: 'seller',
      sellerName: sellerNames.get(sellerId) ?? 'Vendedor',
      heldByName: null,
    }
  }
  if (heldBy) {
    const name = sellerNames.get(heldBy) ?? 'Vendedor'
    return { custody: 'held', sellerName: INVENTORY_COPY.staff.heldBy(name), heldByName: name }
  }
  return { custody: 'common', sellerName: INVENTORY_COPY.staff.commonInventory, heldByName: null }
}

function mapListRow(row: AdminListRow, sellerNames: Map<string, string>): AdminTicketListItem {
  const custody = custodyOf(row.seller_id, row.held_by, sellerNames)
  return {
    id: row.id,
    dailyNumber: row.daily_number,
    weeklyNumber: row.weekly_number,
    inventoryStatus: row.inventory_status,
    paymentState: parsePaymentState(row.payment_state),
    clearanceState: parseClearanceState(row.clearance_state),
    raffleId: row.raffle_id,
    raffleName: row.raffle_name ?? '',
    raffleShortCode: row.raffle_short_code ?? '',
    sellerId: row.seller_id,
    sellerName: custody.sellerName,
    custody: custody.custody,
    heldById: row.seller_id ? null : row.held_by,
    heldByName: custody.heldByName,
    holdExpiresAt: row.seller_id ? null : row.hold_expires_at,
  }
}

/**
 * Una sola llamada para las cuatro lecturas de la lista: la pagina, el recuento,
 * los ids de «seleccionar todas» y las boletas seleccionadas. Un filtro ausente
 * se OMITE del cuerpo, igual que en los reportes: asi la funcion aplica su valor
 * por defecto y no hay dos formas de decir «sin filtro».
 */
async function callAdminList(
  filters: AdminTicketFilters,
  limit: number,
  offset: number,
): Promise<AdminListRow[]> {
  const supabase = await createClient()
  const search = filters.search ? normalizeSearchTerm(filters.search) : ''

  const { data, error } = await supabase.rpc('admin_list_tickets', {
    ...(search !== '' ? { p_search: search } : {}),
    ...(filters.raffleId ? { p_raffle_id: filters.raffleId } : {}),
    ...(filters.sellerId ? { p_seller_id: filters.sellerId } : {}),
    ...(filters.inventoryStatus ? { p_inventory_status: filters.inventoryStatus } : {}),
    ...(filters.paymentState ? { p_payment_state: filters.paymentState } : {}),
    ...(filters.ticketIds ? { p_ticket_ids: [...filters.ticketIds] } : {}),
    ...(filters.custody ? { p_custody: filters.custody } : {}),
    ...(filters.sort
      ? { p_sort_column: filters.sort.column, p_sort_direction: filters.sort.direction }
      : {}),
    p_limit: limit,
    p_offset: offset,
  })

  if (error) throw error
  return (data ?? []) as AdminListRow[]
}

export async function listAdminTickets(filters: AdminTicketFilters): Promise<{
  rows: AdminTicketListItem[]
  total: number
  page: number
  pageSize: number
}> {
  const pageSize = filters.pageSize ?? PAGE_SIZE
  const page = Math.max(1, filters.page ?? 1)

  const [rows, sellerNames, formats] = await Promise.all([
    callAdminList(filters, pageSize, (page - 1) * pageSize),
    sellerNameMap(),
    listRaffleNumberFormats(),
  ])

  /*
    UNA PAGINA QUE NO EXISTE devuelve cero filas, y con ellas se iria el
    recuento: `total_count` viaja repetido en CADA fila, asi que sin filas la
    barra diria «de 0» en una lista que si tiene. Se vuelve a preguntar por la
    primera, que es una sola fila, y solo en ese caso.
  */
  let total = Number(rows[0]?.total_count ?? 0)
  if (rows.length === 0 && page > 1) {
    total = Number((await callAdminList(filters, 1, 0))[0]?.total_count ?? 0)
  }

  return {
    rows: withNumberFormat(
      rows.map((row) => mapListRow(row, sellerNames)),
      formats,
    ),
    total,
    page,
    pageSize,
  }
}

/** Solo los ids, para «seleccionar las N boletas del filtro» (D-103). */
export async function listAdminTicketIds(
  filters: AdminTicketFilters,
  limit: number,
): Promise<{ ids: string[]; total: number }> {
  const rows = await callAdminList(filters, limit, 0)
  return { ids: rows.map((row) => row.id), total: Number(rows[0]?.total_count ?? 0) }
}

/** Las boletas seleccionadas, en el orden en que se marcaron. */
export async function listAdminTicketsByIds(
  ticketIds: readonly string[],
): Promise<AdminTicketListItem[]> {
  if (ticketIds.length === 0) return []

  const wanted = ticketIds.slice(0, BULK_SELECTION_MAX)
  const { rows } = await listAdminTickets({
    ticketIds: wanted,
    pageSize: BULK_SELECTION_MAX,
    page: 1,
  })

  const byId = new Map(rows.map((row) => [row.id, row]))
  return wanted.flatMap((id) => {
    const row = byId.get(id)
    return row ? [row] : []
  })
}

export type AdminTicketDetail = AdminTicketListItem & {
  internalCode: string
  /** Solo de una boleta asignada hoy. */
  saleDate: string | null
  createdAt: string
  approvedAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  raffleStatus: RaffleStatus
  /** Fecha de una entrega MANUAL del paz y salvo; nunca la de la carga inicial (D-170). */
  clearanceDeliveredAt: string | null
  /** Si el apartado vigente ya uso su extension (D-257). */
  holdExtended: boolean
  /** La generacion por rangos que la creo, si la creo una (D-257). */
  generationRunId: string | null
}

const ticketIdSchema = z.uuid()

/**
 * El detalle de una boleta para el personal, o `null`.
 *
 * `null` significa lo mismo para un id que no existe, uno de otra organizacion
 * y uno que ni siquiera es un uuid: la pagina responde 404 en los tres casos y
 * no hay forma de distinguir «no existe» de «no es tuyo».
 */
export async function getAdminTicketDetail(ticketId: string): Promise<AdminTicketDetail | null> {
  if (!ticketIdSchema.safeParse(ticketId).success) return null

  const supabase = await createClient()
  const [{ data, error }, sellerNames, formats] = await Promise.all([
    supabase.rpc('admin_ticket_detail', { p_ticket_id: ticketId }),
    sellerNameMap(),
    listRaffleNumberFormats(),
  ])

  if (error) throw error
  const row = data?.[0]
  if (!row) return null

  const custody = custodyOf(row.seller_id, row.held_by, sellerNames)
  return {
    id: row.id,
    internalCode: row.internal_code,
    dailyNumber: row.daily_number,
    weeklyNumber: row.weekly_number,
    inventoryStatus: row.inventory_status,
    paymentState: parsePaymentState(row.payment_state),
    clearanceState: parseClearanceState(row.clearance_state),
    raffleId: row.raffle_id,
    raffleName: row.raffle_name ?? '',
    raffleShortCode: row.raffle_short_code ?? '',
    raffleStatus: row.raffle_status,
    numberFormat: formats.get(row.raffle_id),
    sellerId: row.seller_id,
    sellerName: custody.sellerName,
    custody: custody.custody,
    heldById: row.seller_id ? null : row.held_by,
    heldByName: custody.heldByName,
    holdExpiresAt: row.seller_id ? null : row.hold_expires_at,
    holdExtended: row.hold_extended,
    generationRunId: row.generation_run_id,
    saleDate: row.sale_date,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    clearanceDeliveredAt: row.clearance_delivered_at,
  }
}

// ---------------------------------------------------------------------------
// Recuentos: panel, vendedores, rifas y reportes del personal
// ---------------------------------------------------------------------------

/** Solo recuentos, ningun importe (alcance B de D-198, BR-Q08). */
export type InventoryCounts = {
  ticketsTotal: number
  ticketsAvailable: number
  ticketsAssigned: number
  ticketsPendingApproval: number
  ticketsDraft: number
  ticketsCancelled: number
  /** Vendidas y pagadas por completo. */
  ticketsPaid: number
  /** Vendidas y sin pagar por completo: `unpaid` + `partial` (BR-Q04). */
  ticketsNotPaid: number
}

/**
 * Una fila por rifa y vendedor. La de `sellerId` NULL es el inventario comun
 * (D-257): sus disponibles incluyen las apartadas ahora, que `ticketsHeld` cuenta.
 * Los totales la suman; las listas por vendedor la ignoran, porque unen por
 * persona.
 */
export type AdminInventoryRow = InventoryCounts & {
  raffleId: string
  sellerId: string | null
  ticketsHeld: number
}

export const ZERO_INVENTORY: InventoryCounts = {
  ticketsTotal: 0,
  ticketsAvailable: 0,
  ticketsAssigned: 0,
  ticketsPendingApproval: 0,
  ticketsDraft: 0,
  ticketsCancelled: 0,
  ticketsPaid: 0,
  ticketsNotPaid: 0,
}

export function addInventory(acc: InventoryCounts, row: InventoryCounts): InventoryCounts {
  return {
    ticketsTotal: acc.ticketsTotal + row.ticketsTotal,
    ticketsAvailable: acc.ticketsAvailable + row.ticketsAvailable,
    ticketsAssigned: acc.ticketsAssigned + row.ticketsAssigned,
    ticketsPendingApproval: acc.ticketsPendingApproval + row.ticketsPendingApproval,
    ticketsDraft: acc.ticketsDraft + row.ticketsDraft,
    ticketsCancelled: acc.ticketsCancelled + row.ticketsCancelled,
    ticketsPaid: acc.ticketsPaid + row.ticketsPaid,
    ticketsNotPaid: acc.ticketsNotPaid + row.ticketsNotPaid,
  }
}

type RawInventoryRow = {
  raffle_id: string
  seller_id: string | null
  tickets_held: number
  tickets_total: number
  tickets_available: number
  tickets_assigned: number
  tickets_pending_approval: number
  tickets_draft: number
  tickets_cancelled: number
  tickets_paid: number
  tickets_not_paid: number
}

/**
 * `admin_ticket_inventory` en crudo: una fila por (rifa, vendedor), ya contada
 * en SQL. Lo que se suma en TypeScript son esas filas —decenas—, nunca boletas.
 *
 * Memoizada POR PETICION con `cache()`, como la lectura que sustituye
 * (`readSellerSummary`, D-103): el panel la necesita para los totales y para el
 * resumen por vendedor en la misma pasada. La rifa se pasa SIEMPRE, como `null`
 * sin filtro, porque `cache()` distingue `f()` de `f(undefined)`.
 *
 * Paginada con `fetchAllRows`: PostgREST corta en 1.000 filas sin avisar
 * (I-011), y rifas por vendedores puede llegar a eso.
 */
export const readAdminTicketInventory = cache(
  async (raffleId: string | null): Promise<AdminInventoryRow[]> => {
    const supabase = await createClient()
    const { rows } = await fetchAllRows<RawInventoryRow>((from, to) =>
      supabase
        .rpc('admin_ticket_inventory', raffleId ? { p_raffle_id: raffleId } : {})
        .order('raffle_id', { ascending: true })
        .order('seller_id', { ascending: true })
        .range(from, to),
    )

    return rows.map((row) => ({
      raffleId: row.raffle_id,
      sellerId: row.seller_id,
      ticketsTotal: Number(row.tickets_total ?? 0),
      ticketsAvailable: Number(row.tickets_available ?? 0),
      ticketsAssigned: Number(row.tickets_assigned ?? 0),
      ticketsPendingApproval: Number(row.tickets_pending_approval ?? 0),
      ticketsDraft: Number(row.tickets_draft ?? 0),
      ticketsCancelled: Number(row.tickets_cancelled ?? 0),
      ticketsPaid: Number(row.tickets_paid ?? 0),
      ticketsNotPaid: Number(row.tickets_not_paid ?? 0),
      ticketsHeld: Number(row.tickets_held ?? 0),
    }))
  },
)

/** El inventario comun de una rifa (o de todas), contado por SQL (D-257). */
export type CommonInventoryCounts = {
  /** Libres: sin vendedor, disponibles y sin apartado vigente. */
  free: number
  /** Apartadas ahora por algun vendedor. */
  held: number
  /** Disponibles con un vendedor: asignadas por el personal o creadas por el. */
  withSellers: number
}

export function commonInventoryCounts(rows: readonly AdminInventoryRow[]): CommonInventoryCounts {
  return rows.reduce<CommonInventoryCounts>(
    (acc, row) =>
      row.sellerId === null
        ? {
            ...acc,
            free: acc.free + row.ticketsAvailable - row.ticketsHeld,
            held: acc.held + row.ticketsHeld,
          }
        : { ...acc, withSellers: acc.withSellers + row.ticketsAvailable },
    { free: 0, held: 0, withSellers: 0 },
  )
}

/** Que acciones de lote admite cada boleta, para el personal (BR-B06, BR-Q07). */
export async function listAdminTicketEligibility(
  ticketIds: readonly string[],
): Promise<AdminTicketEligibility[]> {
  if (ticketIds.length === 0) return []

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_ticket_bulk_eligibility', {
    p_ticket_ids: [...ticketIds],
  })

  if (error) throw error

  const formats = await listRaffleNumberFormats()
  return (data ?? []).map((row) => ({
    numberFormat: formats.get(row.raffle_id),
    audience: 'staff' as const,
    ticketId: row.ticket_id,
    dailyNumber: row.daily_number,
    weeklyNumber: row.weekly_number,
    inventoryStatus: row.inventory_status,
    sellerId: row.seller_id,
    heldBy: row.held_by,
    raffleId: row.raffle_id,
    raffleActive: row.raffle_active,
    can: {
      approve: row.can_approve,
      // El personal no vende: asignar a un cliente es del vendedor (BR-Q06).
      assign: false,
      cancel: row.can_cancel,
      changeSeller: row.can_change_seller,
      delete: row.can_delete,
      assignToSeller: row.can_assign_to_seller,
      recover: row.can_recover,
    },
  }))
}
