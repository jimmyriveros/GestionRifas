'use server'

import { revalidatePath } from 'next/cache'

import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult, ActionResultWith } from '@/lib/action-result'

import {
  approveTicketsSchema,
  cancelTicketSchema,
  createTicketSchema,
  reassignTicketSellerSchema,
  updateTicketNumbersSchema,
} from './schemas'

/**
 * Server Actions de boletas.
 *
 * Aprobar, anular y crear en lote pasan por las RPC de la Fase 2
 * (`approve_tickets`, `cancel_ticket`, `bulk_create_tickets`): son
 * transaccionales, validan permisos por su cuenta y escriben la auditoria.
 * Reimplementar esa logica aqui seria duplicarla y perder la transaccion.
 */

function revalidateTickets(ticketId?: string) {
  revalidatePath('/owner/tickets')
  revalidatePath('/owner/dashboard')
  if (ticketId) revalidatePath(`/owner/tickets/${ticketId}`)
}

export async function createTicket(input: unknown): Promise<ActionResultWith<{ id: string }>> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = createTicketSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()

  const { data: raffle, error: raffleError } = await supabase
    .from('raffles')
    .select('id, status')
    .eq('id', values.raffleId)
    .maybeSingle()

  if (raffleError) return { error: mapPgError(raffleError) }
  if (!raffle) return { error: 'La rifa no existe o no tienes acceso a ella.' }

  // BR-R08: una rifa cerrada o anulada no admite boletas nuevas. La RPC de
  // creacion masiva lo comprueba en SQL; el INSERT directo no, asi que la regla
  // se aplica aqui.
  if (raffle.status !== 'draft' && raffle.status !== 'active') {
    return { error: 'La rifa está cerrada o anulada y no admite boletas nuevas.' }
  }

  const { data, error } = await supabase
    .from('tickets')
    .insert({
      organization_id: auth.membership.organizationId,
      raffle_id: values.raffleId,
      seller_id: values.sellerId,
      daily_number: values.dailyNumber,
      weekly_number: values.weeklyNumber,
      // BR-I04: creada por el personal, con ambos numeros y sin cliente.
      inventory_status: 'available',
      created_by: auth.membership.profileId,
      // internal_code lo genera un trigger (D-039).
    })
    .select('id')
    .single()

  if (error) return { error: mapPgError(error) }

  revalidateTickets()
  return { ok: true, data: { id: data.id } }
}

export async function updateTicketNumbers(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = updateTicketNumbersSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { data: ticket, error: readError } = await supabase
    .from('tickets')
    .select('id, inventory_status')
    .eq('id', values.ticketId)
    .maybeSingle()

  if (readError) return { error: mapPgError(readError) }
  if (!ticket) return { error: 'La boleta no existe o no tienes acceso a ella.' }

  // BR-I06: una boleta anulada conserva sus numeros tal como quedaron; es
  // historia y no se reescribe (D-046).
  if (ticket.inventory_status === 'cancelled') {
    return { error: 'La boleta está anulada y sus números ya no se pueden cambiar.' }
  }

  const { error } = await supabase
    .from('tickets')
    .update({
      daily_number: values.dailyNumber,
      weekly_number: values.weeklyNumber,
      // CLAUDE.md 15: completar un borrador con sus dos numeros lo deja listo
      // para vender. El resto de estados no cambia por editar los numeros.
      ...(ticket.inventory_status === 'draft' ? { inventory_status: 'available' as const } : {}),
    })
    .eq('id', values.ticketId)

  if (error) return { error: mapPgError(error) }

  revalidateTickets(values.ticketId)
  return { ok: true }
}

/**
 * Cambia el vendedor de UNA boleta.
 *
 * Va por `bulk_change_ticket_seller` con un solo id: es la misma funcion que
 * usa el cambio en lote, asi que las reglas —ni asignada ni anulada (BR-C05),
 * destino vendedor activo de la organizacion— se escriben una sola vez y en
 * SQL, donde ademas quedan protegidas de una llamada directa a la API
 * (seccion 43 del encargo). Antes vivian aqui, en un UPDATE sujeto a RLS.
 */
export async function reassignTicketSeller(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = reassignTicketSellerSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.rpc('bulk_change_ticket_seller', {
    p_ticket_ids: [values.ticketId],
    p_seller_id: values.sellerId,
  })

  if (error) return { error: mapPgError(error) }

  revalidateTickets(values.ticketId)
  revalidatePath('/owner/sellers')
  return { ok: true }
}

export async function approveTickets(input: unknown): Promise<ActionResultWith<{ count: number }>> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = approveTicketsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Selecciona al menos una boleta.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('approve_tickets', {
    p_ticket_ids: parsed.data.ticketIds,
  })

  if (error) return { error: mapPgError(error) }

  revalidateTickets()
  return { ok: true, data: { count: data ?? 0 } }
}

export async function cancelTicket(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = cancelTicketSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_ticket', {
    p_ticket_id: parsed.data.ticketId,
    p_reason: parsed.data.reason,
  })

  if (error) return { error: mapPgError(error) }

  revalidateTickets(parsed.data.ticketId)
  return { ok: true }
}
