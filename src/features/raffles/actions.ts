'use server'

import { revalidatePath } from 'next/cache'

import { authorizeAction } from '@/lib/auth/guards'
import { isOwnerOnlyRaffleTransition, RAFFLE_STATUS_TRANSITIONS } from '@/lib/constants'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult, ActionResultWith } from '@/lib/action-result'

import { changeRaffleStatusSchema, createRaffleSchema, updateRaffleSchema } from './schemas'

/**
 * Server Actions de rifas. Orden fijo (docs/ARCHITECTURE.md 7.2):
 * autorizacion -> Zod -> DML sujeto a RLS -> mapPgError -> revalidate.
 *
 * Los campos se escriben con una lista explicita: nunca se propaga al INSERT
 * un objeto recibido del cliente (sin mass assignment, CLAUDE.md 26).
 */

export async function createRaffle(input: unknown): Promise<ActionResultWith<{ id: string }>> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = createRaffleSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('raffles')
    .insert({
      organization_id: auth.membership.organizationId,
      name: values.name,
      description: values.description === '' ? null : values.description,
      ticket_price: values.ticketPrice,
      start_date: values.startDate,
      end_date: values.endDate,
      allow_seller_ticket_creation: values.allowSellerTicketCreation,
      created_by: auth.membership.profileId,
      // status queda en 'draft' (valor por defecto): una rifa se activa
      // explicitamente desde su detalle (BR-R03).
      // short_code lo genera un trigger (D-039).
    })
    .select('id')
    .single()

  if (error) return { error: mapPgError(error) }

  revalidatePath('/owner/raffles')
  revalidatePath('/owner/dashboard')
  return { ok: true, data: { id: data.id } }
}

export async function updateRaffle(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = updateRaffleSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()

  const { data: current, error: readError } = await supabase
    .from('raffles')
    .select('status')
    .eq('id', values.id)
    .maybeSingle()

  if (readError) return { error: mapPgError(readError) }
  if (!current) return { error: 'La rifa no existe o no tienes acceso a ella.' }

  // BR-R08: una rifa cerrada o anulada es historia; sus condiciones de venta no
  // se reescriben. Para corregirla, primero hay que reabrirla (solo el Owner).
  if (current.status === 'closed' || current.status === 'cancelled') {
    return {
      error: 'La rifa está cerrada o anulada y no se puede editar. Reábrela antes de modificarla.',
    }
  }

  const { error } = await supabase
    .from('raffles')
    .update({
      name: values.name,
      description: values.description === '' ? null : values.description,
      ticket_price: values.ticketPrice, // BR-R06: no toca boletas ya vendidas
      start_date: values.startDate,
      end_date: values.endDate,
      allow_seller_ticket_creation: values.allowSellerTicketCreation,
    })
    .eq('id', values.id)

  if (error) return { error: mapPgError(error) }

  revalidatePath('/owner/raffles')
  revalidatePath(`/owner/raffles/${values.id}`)
  revalidatePath('/owner/dashboard')
  return { ok: true }
}

export async function changeRaffleStatus(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = changeRaffleStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const { id, status } = parsed.data

  const supabase = await createClient()
  const { data: current, error: readError } = await supabase
    .from('raffles')
    .select('status')
    .eq('id', id)
    .maybeSingle()

  if (readError) return { error: mapPgError(readError) }
  if (!current) return { error: 'La rifa no existe o no tienes acceso a ella.' }

  if (current.status === status) return { ok: true }

  // BR-R03: transiciones permitidas.
  if (!RAFFLE_STATUS_TRANSITIONS[current.status].includes(status)) {
    return { error: 'Ese cambio de estado no está permitido para la rifa.' }
  }

  // BR-R03: reabrir una rifa cerrada es exclusivo del Owner. La base de datos
  // no distingue owner de admin al actualizar `raffles` (ambos son staff), asi
  // que esta regla vive necesariamente aqui.
  if (isOwnerOnlyRaffleTransition(current.status, status) && auth.membership.role !== 'owner') {
    return { error: 'Solo el dueño de la organización puede reabrir una rifa cerrada.' }
  }

  const { error } = await supabase
    .from('raffles')
    .update({
      status,
      closed_at: status === 'closed' ? new Date().toISOString() : null,
    })
    .eq('id', id)

  if (error) return { error: mapPgError(error) }

  revalidatePath('/owner/raffles')
  revalidatePath(`/owner/raffles/${id}`)
  revalidatePath('/owner/dashboard')
  return { ok: true }
}
