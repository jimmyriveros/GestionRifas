'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResultWith } from '@/lib/action-result'
import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'

import type { TicketListItem } from '../queries'
import type { TicketEligibility } from './eligibility'
import { listTicketEligibility, listTicketIdsMatching, listTicketsByIds } from './queries'
import {
  bulkCancelTicketsSchema,
  bulkChangeTicketSellerSchema,
  bulkDeleteTicketsSchema,
  ticketIdsSchema,
  ticketSelectionFiltersSchema,
} from './schemas'

/**
 * Acciones masivas sobre boletas (BR-B01..BR-B08, D-082).
 *
 * Cada una es UNA llamada para todo el lote, nunca una por boleta: cien
 * boletas son una peticion y una transaccion, no cien de cada (seccion 35 del
 * encargo).
 *
 * Todas siguen el orden de siempre: `authorizeAction` -> Zod -> RPC -> traducir
 * el error -> revalidar -> `{ ok } | { error }`. Lo que decide de verdad son las
 * funciones `bulk_*` de la migracion 0020, que vuelven a comprobar rol,
 * organizacion, propiedad y estado con las filas bloqueadas. Lo de aqui arriba
 * es la primera linea, no la unica (docs/SECURITY.md 1).
 *
 * Ninguna recibe `organizationId` ni `sellerId` como autoridad: la organizacion
 * sale de la sesion y de la propia boleta (seccion 38 del encargo).
 */

function revalidateTicketLists() {
  revalidatePath('/owner/tickets')
  revalidatePath('/owner/dashboard')
  revalidatePath('/owner/sellers')
  revalidatePath('/seller/tickets')
  revalidatePath('/seller/dashboard')
  revalidatePath('/seller/clients')
}

/** Mensaje unico para «se hicieron N» sin caer en «boleta(s)». */
function ticketCount(count: number): string {
  return count === 1 ? '1 boleta' : `${count} boletas`
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

/**
 * Que acciones admite cada boleta seleccionada.
 *
 * Se pide cuando la persona abre el menu de acciones, no en cada clic de una
 * casilla: marcar quince boletas seguidas no debe disparar quince consultas.
 */
export async function getTicketSelectionEligibility(
  input: unknown,
): Promise<ActionResultWith<TicketEligibility[]>> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = ticketIdsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Selecciona al menos una boleta.' }
  }

  try {
    return { ok: true, data: await listTicketEligibility(parsed.data.ticketIds) }
  } catch (error) {
    return { error: mapPgError(error) }
  }
}

/** Las boletas seleccionadas, para revisarlas antes de actuar. */
export async function getSelectedTickets(
  input: unknown,
): Promise<ActionResultWith<TicketListItem[]>> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = ticketIdsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Selecciona al menos una boleta.' }
  }

  try {
    return { ok: true, data: await listTicketsByIds(parsed.data.ticketIds) }
  } catch (error) {
    return { error: mapPgError(error) }
  }
}

/**
 * Resuelve «seleccionar todas las que coinciden» a la lista de ids
 * (seccion 16 del encargo).
 *
 * Devuelve tambien el total real: si supera el tope, la pantalla lo dice en
 * vez de seleccionar un trozo en silencio.
 */
export async function resolveTicketSelection(
  input: unknown,
): Promise<ActionResultWith<{ ids: string[]; total: number }>> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = ticketSelectionFiltersSchema.safeParse(input)
  if (!parsed.success) return { error: 'No pudimos leer los filtros. Vuelve a intentarlo.' }

  try {
    return { ok: true, data: await listTicketIdsMatching(parsed.data) }
  } catch (error) {
    return { error: mapPgError(error) }
  }
}

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------

export async function bulkCancelTickets(
  input: unknown,
): Promise<ActionResultWith<{ count: number; message: string }>> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = bulkCancelTicketsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('bulk_cancel_tickets', {
    p_ticket_ids: parsed.data.ticketIds,
    p_reason: parsed.data.reason,
  })

  if (error) return { error: mapPgError(error) }

  revalidateTicketLists()
  const count = data ?? 0
  return { ok: true, data: { count, message: `Se anularon ${ticketCount(count)}.` } }
}

export async function bulkChangeTicketSeller(
  input: unknown,
): Promise<ActionResultWith<{ count: number; message: string }>> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = bulkChangeTicketSellerSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('bulk_change_ticket_seller', {
    p_ticket_ids: parsed.data.ticketIds,
    p_seller_id: parsed.data.sellerId,
  })

  if (error) return { error: mapPgError(error) }

  revalidateTicketLists()
  const count = data ?? 0
  return { ok: true, data: { count, message: `${ticketCount(count)} cambiaron de vendedor.` } }
}

/**
 * BORRADO FISICO de boletas cargadas por error (BR-B05).
 *
 * No es una forma rapida de anular: solo acepta boletas que nunca entraron a la
 * operacion —sin cliente, sin venta y sin abonos— y jamas una anulada, cuyos
 * numeros quedan reservados a proposito (BR-N08). Lo comprueba la funcion
 * `bulk_delete_tickets`, que ademas deja el rastro en la bitacora antes de
 * borrar.
 */
export async function bulkDeleteTickets(
  input: unknown,
): Promise<ActionResultWith<{ count: number; message: string }>> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = bulkDeleteTicketsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('bulk_delete_tickets', {
    p_ticket_ids: parsed.data.ticketIds,
    p_reason: parsed.data.reason,
  })

  if (error) return { error: mapPgError(error) }

  revalidateTicketLists()
  const count = data ?? 0
  return { ok: true, data: { count, message: `Se eliminaron ${ticketCount(count)}.` } }
}
