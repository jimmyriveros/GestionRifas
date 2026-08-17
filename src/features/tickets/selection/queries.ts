import 'server-only'

import { BULK_SELECTION_MAX } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'

import { listTickets, type TicketFilters, type TicketListItem } from '../queries'
import type { TicketEligibility } from './eligibility'

/**
 * Lecturas que necesita la seleccion multiple.
 *
 * Las tres respetan la RLS sin ayuda: `ticket_bulk_eligibility` es
 * `security invoker` y las otras dos son consultas normales sujetas a
 * `tickets_select`. Un vendedor que mande ids ajenos no obtiene esas filas, y
 * la pantalla lo nota porque recibe menos de las que pidio.
 */

/** Que admite cada boleta de la lista (seccion 27 del encargo). */
export async function listTicketEligibility(
  ticketIds: readonly string[],
): Promise<TicketEligibility[]> {
  if (ticketIds.length === 0) return []

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('ticket_bulk_eligibility', {
    p_ticket_ids: [...ticketIds],
  })

  if (error) throw error

  return (data ?? []).map((row) => ({
    ticketId: row.ticket_id,
    dailyNumber: row.daily_number,
    weeklyNumber: row.weekly_number,
    inventoryStatus: row.inventory_status,
    sellerId: row.seller_id,
    raffleId: row.raffle_id,
    hasClient: row.has_client,
    hasActivePayments: row.has_active_payments,
    hasPayments: row.has_payments,
    raffleActive: row.raffle_active,
    can: {
      approve: row.can_approve,
      assign: row.can_assign,
      cancel: row.can_cancel,
      changeSeller: row.can_change_seller,
      delete: row.can_delete,
    },
    basePrice: Number(row.base_price ?? 0),
    minSalePrice: Number(row.min_sale_price ?? 0),
  }))
}

/**
 * Las boletas seleccionadas, para «Ver seleccionadas» y para los dialogos.
 *
 * Se piden por `id` y no por filtros: la seleccion se acumula entre busquedas
 * distintas (seccion 11 del encargo), asi que no existe un filtro que las
 * describa a todas.
 */
export async function listTicketsByIds(ticketIds: readonly string[]): Promise<TicketListItem[]> {
  if (ticketIds.length === 0) return []

  // Se piden como mucho las del tope; mas no puede haber seleccionadas.
  const wanted = ticketIds.slice(0, BULK_SELECTION_MAX)
  const { rows } = await listTickets({ ticketIds: wanted, pageSize: BULK_SELECTION_MAX, page: 1 })

  // Se devuelven en el orden en que se seleccionaron: es el que la persona
  // reconoce, y el de la base de datos no significaria nada para ella.
  const byId = new Map(rows.map((row) => [row.id, row]))
  return wanted.flatMap((id) => {
    const row = byId.get(id)
    return row ? [row] : []
  })
}

/**
 * Los ids de TODAS las boletas que coinciden con los filtros actuales
 * (seccion 16 del encargo: «Seleccionar las 537 boletas»).
 *
 * Reutiliza la MISMA consulta del listado con el tope como tamano de pagina, en
 * vez de escribir otra. No es por comodidad: si la resolucion filtrara aunque
 * fuera un poco distinto de lo que la persona esta viendo, seleccionaria cosas
 * que no aparecen en pantalla. Compartir la consulta hace que eso no pueda
 * pasar.
 *
 * Al navegador solo viajan los ids (seccion 17 del encargo): mil identificadores
 * son unas decenas de kilobytes, mientras que mil filas completas serian del
 * orden de un megabyte.
 */
export async function listTicketIdsMatching(filters: TicketFilters): Promise<{
  ids: string[]
  total: number
}> {
  const { rows, total } = await listTickets({
    ...filters,
    page: 1,
    pageSize: BULK_SELECTION_MAX,
  })

  return { ids: rows.map((row) => row.id), total }
}
